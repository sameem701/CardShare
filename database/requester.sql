-- database/requester.sql

/* ── CARD REQUESTER PROCEDURES ──────────────────────────────────── */



-- Create Request
-- Sara can only have one active request at a time across entire circle
-- Checks circle membership and card availability
-- Request expires in 15 mins if Ahmed does not respond
CREATE OR REPLACE FUNCTION create_request(
  p_requester_id VARCHAR(36),
  p_card_holder_id VARCHAR(36),
  p_card_id VARCHAR(36),
  p_merchant VARCHAR(100),
  p_product_url TEXT,
  p_delivery_address TEXT,
  p_order_amount INT,
  p_note TEXT
) RETURNS JSON AS $$
DECLARE
  v_request_id VARCHAR(36);
BEGIN
  -- Check they are in the same circle
  IF NOT EXISTS (
    SELECT 1 FROM circle
    WHERE ((user_id = p_requester_id AND friend_id = p_card_holder_id)
    OR (user_id = p_card_holder_id AND friend_id = p_requester_id))
    AND c_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'This user is not in your circle.';
  END IF;

  -- Check card belongs to holder and is shared
  IF NOT EXISTS (
    SELECT 1 FROM cards
    WHERE id = p_card_id
    AND user_id = p_card_holder_id
    AND allow_sharing = 1
  ) THEN
    RAISE EXCEPTION 'Card not found or not available for sharing.';
  END IF;

  -- Check no active request exists across entire circle
  IF EXISTS (
    SELECT 1 FROM requests
    WHERE requester_id = p_requester_id
    AND rq_status IN ('pending', 'accepted', 'escrow_locked', 'tracking_submitted')
  ) THEN
    RAISE EXCEPTION 'You already have an active request. Complete or cancel it before making a new one.';
  END IF;

  v_request_id := uuid_generate_v4()::varchar;

  INSERT INTO requests (
    id, requester_id, card_holder_id, card_id, merchant,
    product_url, delivery_address, order_amount, note,
    rq_status, expires_at, created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id, p_card_holder_id, p_card_id, p_merchant,
    p_product_url, p_delivery_address, p_order_amount, p_note,
    'pending',
    (extract(epoch from now()) * 1000) + 900000,
    extract(epoch from now()) * 1000,
    extract(epoch from now()) * 1000
  );

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, requester_id, card_holder_id, card_id, merchant,
             product_url, order_amount, note, rq_status, expires_at, created_at
      FROM requests WHERE id = v_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Lock Escrow
-- Only works if request is in accepted state
-- Calculates fees here — 2% platform, 3% incentive
-- Creates the transaction row at this moment
-- Updates request status to escrow_locked too so both tables are in sync
-- Returns transaction details so frontend can show Sara the fee breakdown
CREATE OR REPLACE FUNCTION lock_escrow(
  p_request_id VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_txn_id VARCHAR(36);
  v_platform_fee INT;
  v_incentive_fee INT;
  v_total_paid INT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'accepted' THEN
    RAISE EXCEPTION 'Request is not in accepted state.';
  END IF;

  -- Calculate fees
  v_platform_fee := ROUND(v_request.order_amount * 0.02);
  v_incentive_fee := ROUND(v_request.order_amount * 0.03);
  v_total_paid := v_request.order_amount + v_platform_fee + v_incentive_fee;

  -- Create transaction row
  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, request_id, order_amount, platform_fee, incentive_fee,
    total_paid, txn_status, created_at, updated_at
  ) VALUES (
    v_txn_id, p_request_id, v_request.order_amount, v_platform_fee, v_incentive_fee,
    v_total_paid, 'escrow_locked',
    extract(epoch from now()) * 1000,
    extract(epoch from now()) * 1000
  );

  -- Update request status
  UPDATE requests
  SET rq_status = 'escrow_locked',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(t)
    FROM (
      SELECT id, request_id, order_amount, platform_fee,
             incentive_fee, total_paid, txn_status, created_at
      FROM transactions WHERE id = v_txn_id
    ) t
  );
END;
$$ LANGUAGE plpgsql;


-- Confirm Tracking
-- Called by Sara after Ahmed submits tracking ID
-- Releases escrow to Ahmed immediately
-- Updates both request and transaction status to completed
-- Credits Ahmed's wallet with total_paid minus platform fee
CREATE OR REPLACE FUNCTION confirm_tracking(
  p_request_id VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_txn RECORD;
  v_holder_payout INT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status != 'tracking_submitted' THEN
    RAISE EXCEPTION 'No tracking has been submitted yet.';
  END IF;

  SELECT * INTO v_txn FROM transactions
  WHERE request_id = p_request_id;

  -- Calculate payout to Ahmed
  v_holder_payout := v_txn.total_paid - v_txn.platform_fee;

  -- Credit Ahmed's wallet
  UPDATE users
  SET wallet_balance = wallet_balance + v_holder_payout
  WHERE id = v_request.card_holder_id;

  -- Update transaction status
  UPDATE transactions
  SET txn_status = 'completed',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = v_txn.id;

  -- Update request status
  UPDATE requests
  SET rq_status = 'completed',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(t)
    FROM (
      SELECT id, request_id, order_amount, platform_fee,
             incentive_fee, total_paid, txn_status, updated_at
      FROM transactions WHERE id = v_txn.id
    ) t
  );
END;
$$ LANGUAGE plpgsql;



-- Get Request (Requester View)
-- Returns full request details for Sara including card holder and card info
-- Sara always sees her own delivery address
-- Includes transaction details once escrow is locked
-- updated_at included so frontend can show countdown timers
CREATE OR REPLACE FUNCTION get_request_requester(
  p_request_id VARCHAR(36),
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
        req.delivery_address,
        req.note,
        req.rq_status,
        req.expires_at,
        req.created_at,
        req.updated_at,
        u.display_name AS card_holder_name,
        c.bank_name,
        c.card_type,
        c.card_tier,
        row_to_json(t) AS transaction
      FROM requests req
      JOIN users u ON u.id = req.card_holder_id
      JOIN cards c ON c.id = req.card_id
      LEFT JOIN transactions t ON t.request_id = req.id
      WHERE req.id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;