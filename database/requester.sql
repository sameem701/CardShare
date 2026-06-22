-- database/requester.sql

/* ─────────────────────────────────────────────────────────────
   CARD REQUESTER (Sara)
   Flow: create_request → cancel_request (if still pending)
         → get_outgoing_requests / get_request_requester (view progress)
         → confirm_tracking (approve immediately) / raise_dispute (reject)
         → get_transaction_history_requester (view past completed orders)
   ───────────────────────────────────────────────────────────── */


-- Sara creates a request targeting one of Ahmed's shared cards
-- Requires accepted circle membership and card availability
-- Sara can have only one active request at a time across her entire circle
-- Upfront balance check — escrow locks automatically inside accept_request
-- Request expires in 15 mins if Ahmed does not respond
CREATE OR REPLACE FUNCTION create_request(
  p_requester_id        VARCHAR(36),
  p_card_holder_id      VARCHAR(36),
  p_card_id             VARCHAR(36),
  p_merchant            VARCHAR(100),
  p_product_url         TEXT,
  p_delivery_address    TEXT,
  p_order_amount        INT,
  p_discount_percentage INT,
  p_note                TEXT
) RETURNS JSON AS $$
DECLARE
  v_request_id VARCHAR(36);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle
    WHERE ((user_id = p_requester_id AND friend_id = p_card_holder_id)
    OR (user_id = p_card_holder_id AND friend_id = p_requester_id))
    AND c_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'This user is not in your circle.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cards
    WHERE id = p_card_id
    AND user_id = p_card_holder_id
    AND allow_sharing = 1
  ) THEN
    RAISE EXCEPTION 'Card not found or not available for sharing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM requests
    WHERE requester_id = p_requester_id
    AND rq_status IN ('pending', 'escrow_locked', 'tracking_submitted') -- all possible active states
  ) THEN
    RAISE EXCEPTION 'You already have an active request. Complete or cancel it before making a new one.';
  END IF;

  IF (SELECT wallet_balance FROM users WHERE id = p_requester_id) < p_order_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance to cover order amount.';
  END IF;

  v_request_id := uuid_generate_v4()::varchar;

  INSERT INTO requests (
    id, requester_id, card_holder_id, card_id, merchant,
    product_url, delivery_address, order_amount, discount_percentage, note,
    rq_status, expires_at, created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id, p_card_holder_id, p_card_id, p_merchant,
    p_product_url, p_delivery_address, p_order_amount, p_discount_percentage, p_note,
    'pending',
    (extract(epoch from now()) * 1000) + 900000,
    extract(epoch from now()) * 1000,
    extract(epoch from now()) * 1000
  );

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, requester_id, card_holder_id, card_id, merchant,
             product_url, order_amount, discount_percentage, note,
             rq_status, expires_at, created_at
      FROM requests WHERE id = v_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Sara cancels her own request
-- Only allowed while still pending — once Ahmed accepts escrow locks and cancellation is blocked
CREATE OR REPLACE FUNCTION cancel_request(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'pending' THEN
    RAISE EXCEPTION 'Request can only be cancelled while pending. Once accepted escrow is locked automatically.';
  END IF;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id',   p_request_id,
    'merchant',     v_request.merchant,
    'order_amount', v_request.order_amount,
    'result',       'cancelled'
  );
END;
$$ LANGUAGE plpgsql;



-- Sara views full detail of a single active request
-- updated_at lets the frontend show countdown timers
CREATE OR REPLACE FUNCTION get_request_requester(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT
        req.id,
        req.merchant,
        req.product_url,
        req.order_amount,
        req.discount_percentage,
        req.delivery_address,
        req.note,
        req.rq_status,
        req.platform_fee,
        req.incentive_fee,
        req.total_paid,
        req.actual_amount_paid,
        req.tracking_id,
        req.delivery_expected_at,
        req.expires_at,
        req.created_at,
        req.updated_at,
        u.display_name AS card_holder_name,
        c.bank_name,
        c.card_type,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.card_holder_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Sara actively approves after seeing the tracking ID
-- Pays Ahmed immediately — faster than waiting for auto_release_escrow
-- If Sara does nothing, auto_release_escrow pays Ahmed after 15 mins anyway
-- Creates sealed transaction record, deletes request row
CREATE OR REPLACE FUNCTION confirm_tracking(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'tracking_submitted' THEN
    RAISE EXCEPTION 'Tracking has not been submitted yet.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;

  -- Pay Ahmed: what he actually spent at checkout + his incentive fee
  UPDATE users
  SET wallet_balance = wallet_balance + (v_request.actual_amount_paid + v_request.incentive_fee)
  WHERE id = v_request.card_holder_id;

  -- Collect platform fee
  UPDATE platform_account
  SET wallet_balance = wallet_balance + v_request.platform_fee
  WHERE id = 1;

  -- Refund Sara the leftover
  UPDATE users
  SET wallet_balance = wallet_balance + (v_request.total_paid - v_request.actual_amount_paid - v_request.incentive_fee - v_request.platform_fee)
  WHERE id = v_request.requester_id;

  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, card_holder_id, merchant, product_url,
    delivery_address, order_amount, discount_percentage, note,
    bank_name, card_type, card_tier,
    platform_fee, incentive_fee, total_paid, actual_amount_paid,
    txn_status, tracking_id, delivery_expected_at, dispute_reason,
    created_at, updated_at
  ) VALUES (
    v_txn_id, v_request.requester_id, v_request.card_holder_id,
    v_request.merchant, v_request.product_url, v_request.delivery_address,
    v_request.order_amount, v_request.discount_percentage, v_request.note,
    v_card.bank_name, v_card.card_type, v_card.card_tier,
    v_request.platform_fee, v_request.incentive_fee, v_request.total_paid, v_request.actual_amount_paid,
    'completed', v_request.tracking_id, v_request.delivery_expected_at, NULL,
    extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'completed'
  );
END;
$$ LANGUAGE plpgsql;


-- Sara rejects within the 15 min dispute window after tracking is submitted
-- Sara is refunded immediately — Ahmed is urged to cancel his placed order
-- Sealed transaction record created with dispute_reason, request row deleted
CREATE OR REPLACE FUNCTION raise_dispute(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_reason       TEXT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'tracking_submitted' THEN
    RAISE EXCEPTION 'Disputes can only be raised after tracking is submitted.';
  END IF;

  -- Enforce 15 min window from when tracking was submitted (updated_at on request)
  IF (extract(epoch from now()) * 1000) > (v_request.updated_at + 900000) THEN
    RAISE EXCEPTION 'Dispute window has closed. Payment has been released automatically.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to raise a dispute.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;

  -- Refund Sara immediately
  UPDATE users
  SET wallet_balance = wallet_balance + v_request.total_paid
  WHERE id = v_request.requester_id;

  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, card_holder_id, merchant, product_url,
    delivery_address, order_amount, discount_percentage, note,
    bank_name, card_type, card_tier,
    platform_fee, incentive_fee, total_paid, actual_amount_paid,
    txn_status, tracking_id, delivery_expected_at, dispute_reason,
    created_at, updated_at
  ) VALUES (
    v_txn_id, v_request.requester_id, v_request.card_holder_id,
    v_request.merchant, v_request.product_url, v_request.delivery_address,
    v_request.order_amount, v_request.discount_percentage, v_request.note,
    v_card.bank_name, v_card.card_type, v_card.card_tier,
    v_request.platform_fee, v_request.incentive_fee, v_request.total_paid, v_request.actual_amount_paid,
    'disputed', v_request.tracking_id, v_request.delivery_expected_at, p_reason,
    extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',         v_txn_id,
    'txn_status',     'disputed',
    'dispute_reason', p_reason
  );
END;
$$ LANGUAGE plpgsql;


-- Sara's history of all finalised orders
-- Reads from transactions table — request rows are deleted after finalisation
CREATE OR REPLACE FUNCTION get_transaction_history_requester(
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(t), '[]'::json)
    FROM (
      SELECT
        txn.id,
        txn.merchant,
        txn.product_url,
        txn.delivery_address,
        txn.order_amount,
        txn.discount_percentage,
        txn.bank_name,
        txn.card_type,
        txn.card_tier,
        txn.platform_fee,
        txn.incentive_fee,
        txn.total_paid,
        txn.actual_amount_paid,
        txn.txn_status,
        txn.tracking_id,
        txn.delivery_expected_at,
        txn.dispute_reason,
        txn.created_at,
        txn.updated_at,
        u.display_name AS card_holder_name
      FROM transactions txn
      JOIN users u ON u.id = txn.card_holder_id
      WHERE txn.requester_id = p_requester_id
      ORDER BY txn.created_at DESC
    ) t
  );
END;
$$ LANGUAGE plpgsql;
