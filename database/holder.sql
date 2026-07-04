-- database/holder.sql

/* ─────────────────────────────────────────────────────────────
   CARD HOLDER (Ahmed)
   Flow: get_incoming_requests → accept_request / decline_request
         → [payment_pending — awaiting Sara's payment] → get_active_orders_holder → submit_tracking
         → get_request_holder (view detail at any point)
         → get_transaction_history_holder (view past completed orders)
   No order timers — trust circle; parties coordinate at their own pace.
   ───────────────────────────────────────────────────────────── */


-- Ahmed sees all pending requests sent to him
-- Delivery address not included — only visible once escrow locks
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


-- Ahmed accepts Sara's request
-- Row locked with FOR UPDATE — competes with decline_request and cancel_request
-- Fees are NOT set here — calculated at submit_tracking from actual_amount_paid
CREATE OR REPLACE FUNCTION accept_request(
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

  UPDATE requests
  SET rq_status  = 'payment_pending',
      updated_at = extract(epoch from now()) * 1000
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


-- Ahmed declines Sara's request
-- Row locked with FOR UPDATE — competes with accept_request and cancel_request
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


-- Ahmed cancels an order he already accepted
-- Only allowed from escrow_locked — once tracking is submitted Ahmed has committed
-- Row locked with FOR UPDATE — competes with submit_tracking
CREATE OR REPLACE FUNCTION cancel_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
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

  -- Refund Sara in full — Ahmed paid nothing so nothing is owed to him
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
    COALESCE(v_request.platform_fee, 0), COALESCE(v_request.incentive_fee, 0), NULL,
    'cancelled', NULL, NULL,
    extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',          v_txn_id,
    'txn_status',      'cancelled',
    'amount_refunded', v_request.order_amount
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed submits screenshot + checkout amount after placing the order
-- Fees calculated here from actual_saving = order_amount − actual_amount_paid
-- Row locked with FOR UPDATE — competes with cancel_request_holder
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
  v_incentive_fee   := ROUND(v_actual_saving * 0.25);

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


-- Ahmed sees orders he has already accepted
-- payment_pending    = awaiting Sara's payment confirmation
-- escrow_locked      = Ahmed must submit screenshot when ready
-- tracking_submitted = tracking submitted, awaiting Sara's confirm or dispute
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
        req.delivery_address,
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


-- Full detail view for Ahmed on any active request
-- Delivery address hidden until escrow is locked
CREATE OR REPLACE FUNCTION get_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id;

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
          WHEN req.rq_status IN ('payment_pending', 'escrow_locked', 'tracking_submitted')
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


-- Ahmed's history of all finalised orders
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
