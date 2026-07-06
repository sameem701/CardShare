-- database/holder.sql

/* ─────────────────────────────────────────────────────────────
   CARD HOLDER (Ahmed)
   Flow: get_incoming_requests → accept_request / decline_request
         → [payment_pending — PSP pay] → get_active_orders_holder → submit_tracking
         → get_request_holder → get_transaction_history_holder
   accept_request: payout verified; 24h cooldown only after re-link (payout_relinked_at)
   Fees on actual saving: 5% platform, 15% holder incentive
   cancel/dispute refunds via PSP webhook before SQL seals transaction
   ───────────────────────────────────────────────────────────── */


CREATE OR REPLACE FUNCTION get_incoming_requests(
  p_holder_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(r), '[]'::json)
    FROM (
      SELECT
        req.id,
        req.merchant,
        req.product_url,
        req.order_amount,
        req.discount_percentage,
        req.note,
        req.rq_status,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
        c.card_type,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.requester_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.card_holder_id = p_holder_id
      AND req.rq_status = 'pending'
      ORDER BY req.created_at DESC
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed accepts — payout verified; 24h cooldown only after changing payout
CREATE OR REPLACE FUNCTION accept_request(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_holder  RECORD;
  v_now     BIGINT;
BEGIN
  SELECT * INTO v_holder FROM users WHERE id = p_holder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_holder.payout_status != 'verified' THEN
    RAISE EXCEPTION 'Link your payout account before accepting requests.';
  END IF;

  v_now := extract(epoch from now()) * 1000;

  IF v_holder.payout_relinked_at IS NOT NULL
     AND v_now < v_holder.payout_relinked_at + 86400000 THEN
    RAISE EXCEPTION 'You can accept requests 24 hours after changing your payout account.';
  END IF;

  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  UPDATE requests
  SET rq_status  = 'payment_pending',
      updated_at = v_now
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, merchant, order_amount, discount_percentage,
             rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION decline_request(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id',    p_request_id,
    'merchant',      v_request.merchant,
    'order_amount',  v_request.order_amount,
    'result',        'declined'
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed cancels from escrow_locked — call after PSP refund webhook
CREATE OR REPLACE FUNCTION cancel_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_now     BIGINT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'escrow_locked'
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
    COALESCE(v_request.platform_fee, 0), COALESCE(v_request.incentive_fee, 0), NULL,
    'cancelled', NULL, NULL,
    v_request.psp_hold_id, v_request.psp_paid_at, v_now,
    v_now, v_now
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',          v_txn_id,
    'txn_status',      'cancelled',
    'amount_refunded', v_request.order_amount
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION submit_tracking(
  p_request_id         VARCHAR(36),
  p_holder_id          VARCHAR(36),
  p_screenshot_url     VARCHAR(200),
  p_actual_amount_paid INT
) RETURNS JSON AS $$
DECLARE
  v_request         RECORD;
  v_actual_saving   INT;
  v_platform_fee    INT;
  v_incentive_fee   INT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'escrow_locked'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  IF p_actual_amount_paid <= 0 THEN
    RAISE EXCEPTION 'Actual amount paid must be greater than zero.';
  END IF;

  IF p_actual_amount_paid > v_request.order_amount THEN
    RAISE EXCEPTION 'Actual amount paid cannot exceed the order amount.';
  END IF;

  v_actual_saving   := v_request.order_amount - p_actual_amount_paid;
  v_platform_fee    := ROUND(v_actual_saving * 0.05);
  v_incentive_fee   := ROUND(v_actual_saving * 0.15);

  UPDATE requests
  SET screenshot_url     = p_screenshot_url,
      actual_amount_paid = p_actual_amount_paid,
      platform_fee       = v_platform_fee,
      incentive_fee      = v_incentive_fee,
      rq_status          = 'tracking_submitted',
      updated_at         = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, screenshot_url, actual_amount_paid,
             platform_fee, incentive_fee,
             rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_active_orders_holder(
  p_holder_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(r), '[]'::json)
    FROM (
      SELECT
        req.id,
        req.merchant,
        req.product_url,
        req.order_amount,
        req.discount_percentage,
        CASE
          WHEN req.rq_status IN ('escrow_locked', 'tracking_submitted')
          THEN req.delivery_address
          ELSE NULL
        END AS delivery_address,
        req.note,
        req.rq_status,
        req.platform_fee,
        req.incentive_fee,
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
        c.card_type,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.requester_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.card_holder_id = p_holder_id
      AND req.rq_status IN ('payment_pending', 'escrow_locked', 'tracking_submitted')
      ORDER BY req.created_at DESC
    ) r
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_request_id
    AND card_holder_id = p_holder_id
  ) THEN
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
        req.note,
        req.rq_status,
        req.platform_fee,
        req.incentive_fee,
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
        c.card_type,
        c.card_tier,
        CASE
          WHEN req.rq_status IN ('escrow_locked', 'tracking_submitted')
          THEN req.delivery_address
          ELSE NULL
        END AS delivery_address
      FROM requests req
      JOIN users u ON u.id = req.requester_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_transaction_history_holder(
  p_holder_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(t), '[]'::json)
    FROM (
      SELECT
        txn.id,
        txn.merchant,
        txn.product_url,
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
        u.display_name AS requester_name
      FROM transactions txn
      JOIN users u ON u.id = txn.requester_id
      WHERE txn.card_holder_id = p_holder_id
      ORDER BY txn.created_at DESC
    ) t
  );
END;
$$ LANGUAGE plpgsql;
