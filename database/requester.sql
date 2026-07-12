-- database/requester.sql

/* ─────────────────────────────────────────────────────────────
   CARD REQUESTER (Sara)
   Flow: create_request → cancel_request (pending or payment_pending)
         → [Ahmed accepts → payment_pending] → PSP pay → lock_escrow (webhook)
         → get_active_requests_requester (list) / get_request_requester (detail)
         → confirm_tracking / raise_dispute (after PSP webhook — anytime after tracking)
         → get_transaction_history_requester
   Fees on actual saving: 5% platform, 15% holder incentive, 80% saved (requester).
   One active request per friend pair. No create-time balance check.
   All business rules enforced here — direct API calls included.
   ───────────────────────────────────────────────────────────── */


-- Sara creates a request targeting one of Ahmed's shared cards
-- Holder must be payout-verified (same rule as get_circle_cards)
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
  IF p_order_amount <= 100 THEN
    RAISE EXCEPTION 'Order amount must be greater than 100 PKR.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle
    WHERE ((user_id = p_requester_id AND friend_id = p_card_holder_id)
    OR (user_id = p_card_holder_id AND friend_id = p_requester_id))
    AND c_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'This user is not in your circle.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_card_holder_id
    AND payout_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'This card holder has not linked a payout account yet.';
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
    AND card_holder_id = p_card_holder_id
    AND rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
  ) THEN
    RAISE EXCEPTION 'You already have an active request with this person.';
  END IF;

  v_request_id := uuid_generate_v4()::varchar;

  v_expected_saving   := ROUND(p_order_amount * (p_discount_percentage / 100.0));
  v_est_platform_fee  := ROUND(v_expected_saving * 0.05);
  v_est_incentive_fee := ROUND(v_expected_saving * 0.15);

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


-- Sara cancels before escrow locks
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
    RAISE EXCEPTION 'Request not found or access denied.';
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


-- Sara's active purchases across her circle
CREATE OR REPLACE FUNCTION get_active_requests_requester(
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(r), '[]'::json)
    FROM (
      SELECT
        req.id,
        req.card_holder_id,
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
        req.psp_hold_id,
        req.psp_paid_at,
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
      ORDER BY req.created_at DESC
    ) r
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_request_requester(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_request_id
    AND requester_id = p_requester_id
  ) THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT
        req.id,
        req.card_holder_id,
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
        req.psp_hold_id,
        req.psp_paid_at,
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


-- Sara confirms after PSP release webhook — bumps saved/earned counters only
CREATE OR REPLACE FUNCTION confirm_tracking(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_saved   INT;
  v_now     BIGINT;
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

  v_saved := v_request.order_amount - v_request.actual_amount_paid
             - v_request.incentive_fee - v_request.platform_fee;

  UPDATE users
  SET total_earned = total_earned + v_request.incentive_fee
  WHERE id = v_request.card_holder_id;

  UPDATE users
  SET total_saved = total_saved + v_saved
  WHERE id = v_request.requester_id;

  v_now    := extract(epoch from now()) * 1000;
  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, card_holder_id, merchant, product_url,
    delivery_address, order_amount, discount_percentage, note,
    bank_name, card_type, card_tier,
    platform_fee, incentive_fee, actual_amount_paid,
    txn_status, screenshot_url, dispute_reason,
    psp_hold_id, psp_paid_at, psp_settled_at,
    created_at, updated_at
  ) VALUES (
    v_txn_id, v_request.requester_id, v_request.card_holder_id,
    v_request.merchant, v_request.product_url, v_request.delivery_address,
    v_request.order_amount, v_request.discount_percentage, v_request.note,
    v_card.bank_name, v_card.card_type, v_card.card_tier,
    v_request.platform_fee, v_request.incentive_fee, v_request.actual_amount_paid,
    'completed', v_request.screenshot_url, NULL,
    v_request.psp_hold_id, v_request.psp_paid_at, v_now,
    v_now, v_now
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'completed'
  );
END;
$$ LANGUAGE plpgsql;


-- Sara disputes after PSP refund webhook
CREATE OR REPLACE FUNCTION raise_dispute(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_reason       TEXT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_now     BIGINT;
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

  v_now    := extract(epoch from now()) * 1000;
  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, card_holder_id, merchant, product_url,
    delivery_address, order_amount, discount_percentage, note,
    bank_name, card_type, card_tier,
    platform_fee, incentive_fee, actual_amount_paid,
    txn_status, screenshot_url, dispute_reason,
    psp_hold_id, psp_paid_at, psp_settled_at,
    created_at, updated_at
  ) VALUES (
    v_txn_id, v_request.requester_id, v_request.card_holder_id,
    v_request.merchant, v_request.product_url, v_request.delivery_address,
    v_request.order_amount, v_request.discount_percentage, v_request.note,
    v_card.bank_name, v_card.card_type, v_card.card_tier,
    v_request.platform_fee, v_request.incentive_fee, v_request.actual_amount_paid,
    'disputed', v_request.screenshot_url, p_reason,
    v_request.psp_hold_id, v_request.psp_paid_at, v_now,
    v_now, v_now
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',         v_txn_id,
    'txn_status',     'disputed',
    'dispute_reason', p_reason
  );
END;
$$ LANGUAGE plpgsql;


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
        txn.psp_hold_id,
        txn.psp_paid_at,
        txn.psp_settled_at,
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
