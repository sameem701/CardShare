-- database/holder.sql

/* ─────────────────────────────────────────────────────────────
   CARD HOLDER (Ahmed)
   Flow: get_incoming_requests → accept_request / decline_request
         → get_active_orders_holder → submit_tracking
         → get_request_holder (view detail at any point)
         → get_transaction_history_holder (view past completed orders)
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
        req.expires_at,
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
-- Fees are calculated and stored on the request row — no transaction created yet
-- Sara's wallet is deducted immediately (escrow locked on the request)
-- Ahmed has 30 mins to submit tracking or auto_release_escrow refunds Sara
CREATE OR REPLACE FUNCTION accept_request(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request       RECORD;
  v_platform_fee  INT;
  v_incentive_fee INT;
  v_total_paid    INT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'pending' THEN
    RAISE EXCEPTION 'Request is not in pending state.';
  END IF;

  IF (extract(epoch from now()) * 1000) > v_request.expires_at THEN
    DELETE FROM requests WHERE id = p_request_id;
    RAISE EXCEPTION 'Request has expired.';
  END IF;

  -- platform_fee = 1%, incentive_fee = 2.5% of order_amount
  v_platform_fee  := ROUND(v_request.order_amount * 0.01);
  v_incentive_fee := ROUND(v_request.order_amount * 0.025);
  v_total_paid    := v_request.order_amount + v_platform_fee + v_incentive_fee;

  -- Double-check Sara's balance in case it changed since create_request
  IF (SELECT wallet_balance FROM users WHERE id = v_request.requester_id) < v_total_paid THEN
    DELETE FROM requests WHERE id = p_request_id;
    RAISE EXCEPTION 'Requester has insufficient balance. Request has been deleted.';
  END IF;

  UPDATE users
  SET wallet_balance = wallet_balance - v_total_paid
  WHERE id = v_request.requester_id;

  -- Store fee snapshot on the request row — used at settlement time
  UPDATE requests
  SET rq_status     = 'escrow_locked',
      platform_fee  = v_platform_fee,
      incentive_fee = v_incentive_fee,
      total_paid    = v_total_paid,
      updated_at    = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, merchant, order_amount, discount_percentage,
             delivery_address, platform_fee, incentive_fee, total_paid,
             rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed declines Sara's request
-- Only works from pending state — Sara is freed to make a new request immediately
CREATE OR REPLACE FUNCTION decline_request(
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

  IF v_request.rq_status != 'pending' THEN
    RAISE EXCEPTION 'Request is not in pending state.';
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
-- Sara is refunded her full total_paid immediately
-- Sealed transaction record created with status 'cancelled', request row deleted
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
  AND card_holder_id = p_holder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'escrow_locked' THEN
    RAISE EXCEPTION 'Request can only be cancelled while escrow is locked. Once tracking is submitted it cannot be cancelled.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;

  -- Refund Sara in full — Ahmed paid nothing so nothing is owed to him
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
    v_request.platform_fee, v_request.incentive_fee, v_request.total_paid, NULL,
    'cancelled', NULL, NULL, NULL,
    extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
  );

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',          v_txn_id,
    'txn_status',      'cancelled',
    'amount_refunded', v_request.total_paid
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed sees orders he has already accepted
-- escrow_locked   = he still needs to place the order and submit tracking
-- tracking_submitted = tracking submitted, waiting for Sara's 15 min dispute window
-- Financial data read directly from requests row (no transaction exists yet)
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
        req.total_paid,
        req.actual_amount_paid,
        req.tracking_id,
        req.delivery_expected_at,
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
      AND req.rq_status IN ('escrow_locked', 'tracking_submitted')
      ORDER BY req.created_at DESC
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed submits the tracking ID after placing the order
-- actual_amount_paid = what Ahmed actually paid at checkout
-- Backend defaults this to ROUND(order_amount * (1 - discount_percentage / 100.0)) for MVP
-- Starts Sara's 15 min dispute window
CREATE OR REPLACE FUNCTION submit_tracking(
  p_request_id           VARCHAR(36),
  p_holder_id            VARCHAR(36),
  p_tracking_id          VARCHAR(200),
  p_delivery_expected_at BIGINT,
  p_actual_amount_paid   INT
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

  IF v_request.rq_status != 'escrow_locked' THEN
    RAISE EXCEPTION 'Escrow is not locked. Cannot submit tracking.';
  END IF;

  IF p_actual_amount_paid <= 0 THEN
    RAISE EXCEPTION 'Actual amount paid must be greater than zero.';
  END IF;

  -- actual_amount_paid + fees must not exceed total_paid (what Sara locked)
  IF (p_actual_amount_paid + v_request.incentive_fee + v_request.platform_fee) > v_request.total_paid THEN
    RAISE EXCEPTION 'Actual amount paid exceeds the escrowed amount. Please cancel the request instead.';
  END IF;

  UPDATE requests
  SET tracking_id          = p_tracking_id,
      delivery_expected_at = p_delivery_expected_at,
      actual_amount_paid   = p_actual_amount_paid,
      rq_status            = 'tracking_submitted',
      updated_at           = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, tracking_id, delivery_expected_at,
             actual_amount_paid, rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Full detail view for Ahmed on any active request
-- Delivery address hidden until escrow is locked
-- Financial data read directly from requests row
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
        req.total_paid,
        req.actual_amount_paid,
        req.tracking_id,
        req.delivery_expected_at,
        req.expires_at,
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


-- Ahmed's history of all finalised orders
-- Reads from transactions table — request rows are deleted after finalisation
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
        txn.total_paid,
        txn.actual_amount_paid,
        txn.txn_status,
        txn.tracking_id,
        txn.delivery_expected_at,
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
