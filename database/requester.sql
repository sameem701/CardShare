-- database/requester.sql

/* ─────────────────────────────────────────────────────────────
   CARD REQUESTER (Sara)
   Flow: create_request → cancel_request (pending or payment_pending, before Sara pays)
         → [Ahmed accepts → payment_pending] → confirm_payment (Sara pays, escrow locks)
         → get_request_requester (view current active purchase)
         → confirm_tracking / raise_dispute (anytime after tracking submitted)
         → get_transaction_history_requester (view past completed orders)
   No order timers — trust circle; parties coordinate at their own pace.
   ───────────────────────────────────────────────────────────── */


-- Sara creates a request targeting one of Ahmed's shared cards
-- Requires accepted circle membership and card availability
-- Sara can have only one active request at a time across her entire circle
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
  v_request_id        VARCHAR(36);
  v_expected_saving   INT;
  v_est_platform_fee  INT;
  v_est_incentive_fee INT;
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
    RAISE EXCEPTION 'Card not found.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM requests
    WHERE requester_id = p_requester_id
    AND rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
  ) THEN
    RAISE EXCEPTION 'You already have an active request. Complete or cancel it before making a new one.';
  END IF;

  IF (SELECT wallet_balance FROM users WHERE id = p_requester_id) < p_order_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance to cover order amount.';
  END IF;

  v_request_id := uuid_generate_v4()::varchar;

  v_expected_saving   := ROUND(p_order_amount * (p_discount_percentage / 100.0));
  v_est_platform_fee  := ROUND(v_expected_saving * 0.05);
  v_est_incentive_fee := ROUND(v_expected_saving * 0.25);

  INSERT INTO requests (
    id, requester_id, card_holder_id, card_id, merchant,
    product_url, delivery_address, order_amount, discount_percentage, note,
    rq_status, created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id, p_card_holder_id, p_card_id, p_merchant,
    p_product_url, p_delivery_address, p_order_amount, p_discount_percentage, p_note,
    'pending',
    extract(epoch from now()) * 1000,
    extract(epoch from now()) * 1000
  );

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, requester_id, card_holder_id, card_id, merchant,
             product_url, order_amount, discount_percentage, note,
             rq_status, created_at,
             v_expected_saving   AS estimated_saving,
             v_est_platform_fee  AS estimated_platform_fee,
             v_est_incentive_fee AS estimated_incentive_fee
      FROM requests WHERE id = v_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Sara cancels her own request before escrow locks
-- Allowed in pending or payment_pending — row locked with FOR UPDATE
CREATE OR REPLACE FUNCTION cancel_request(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status IN ('pending', 'payment_pending')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied or access denied.';
  END IF;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id',      p_request_id,
    'merchant',        v_request.merchant,
    'order_amount',    v_request.order_amount,
    'card_holder_id',  v_request.card_holder_id,
    'previous_status', v_request.rq_status,
    'result',          'cancelled'
  );
END;
$$ LANGUAGE plpgsql;


-- Sara confirms payment after Ahmed accepts (pay-on-accept model)
-- Row locked with FOR UPDATE — competes with cancel_request
CREATE OR REPLACE FUNCTION confirm_payment(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status = 'payment_pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  IF (SELECT wallet_balance FROM users WHERE id = p_requester_id) < v_request.order_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  UPDATE users
  SET wallet_balance = wallet_balance - v_request.order_amount
  WHERE id = p_requester_id;

  UPDATE requests
  SET rq_status  = 'escrow_locked',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, merchant, order_amount, platform_fee, incentive_fee, rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Sara's current purchase (0 or 1 row)
CREATE OR REPLACE FUNCTION get_request_requester(
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
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
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        u.display_name AS card_holder_name,
        c.bank_name,
        c.card_type,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.card_holder_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.requester_id = p_requester_id
      AND req.rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Sara approves after seeing the screenshot — pays Ahmed and settles
-- Row locked with FOR UPDATE — competes with raise_dispute
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
  AND requester_id = p_requester_id
  AND rq_status = 'tracking_submitted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;

  UPDATE users
  SET wallet_balance = wallet_balance + (v_request.actual_amount_paid + v_request.incentive_fee)
  WHERE id = v_request.card_holder_id;

  UPDATE platform_account
  SET wallet_balance = wallet_balance + v_request.platform_fee
  WHERE id = 1;

  UPDATE users
  SET wallet_balance = wallet_balance + (v_request.order_amount - v_request.actual_amount_paid - v_request.incentive_fee - v_request.platform_fee)
  WHERE id = v_request.requester_id;

  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, card_holder_id, merchant, product_url,
    delivery_address, order_amount, discount_percentage, note,
    bank_name, card_type, card_tier,
    platform_fee, incentive_fee, actual_amount_paid,
    txn_status, screenshot_url, dispute_reason,
    created_at, updated_at
  ) VALUES (
    v_txn_id, v_request.requester_id, v_request.card_holder_id,
    v_request.merchant, v_request.product_url, v_request.delivery_address,
    v_request.order_amount, v_request.discount_percentage, v_request.note,
    v_card.bank_name, v_card.card_type, v_card.card_tier,
    v_request.platform_fee, v_request.incentive_fee, v_request.actual_amount_paid,
    'completed', v_request.screenshot_url, NULL,
    extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'completed'
  );
END;
$$ LANGUAGE plpgsql;


-- Sara rejects the screenshot/amount — full refund
-- Row locked with FOR UPDATE — competes with confirm_tracking
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
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to raise a dispute.';
  END IF;

  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status = 'tracking_submitted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;

  UPDATE users
  SET wallet_balance = wallet_balance + v_request.order_amount
  WHERE id = v_request.requester_id;

  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, card_holder_id, merchant, product_url,
    delivery_address, order_amount, discount_percentage, note,
    bank_name, card_type, card_tier,
    platform_fee, incentive_fee, actual_amount_paid,
    txn_status, screenshot_url, dispute_reason,
    created_at, updated_at
  ) VALUES (
    v_txn_id, v_request.requester_id, v_request.card_holder_id,
    v_request.merchant, v_request.product_url, v_request.delivery_address,
    v_request.order_amount, v_request.discount_percentage, v_request.note,
    v_card.bank_name, v_card.card_type, v_card.card_tier,
    v_request.platform_fee, v_request.incentive_fee, v_request.actual_amount_paid,
    'disputed', v_request.screenshot_url, p_reason,
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
        txn.actual_amount_paid,
        txn.txn_status,
        txn.screenshot_url,
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
