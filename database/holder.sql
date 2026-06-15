-- database/holder.sql

/* ── CARD HOLDER PROCEDURES ──────────────────────────────────── */


-- Get Incoming Requests (Holder View)
-- Returns all pending and accepted requests sent to Ahmed
-- Accepted included so Ahmed can see requests waiting for Sara to lock escrow
-- Does not include delivery address — not visible until escrow is locked
CREATE OR REPLACE FUNCTION get_incoming_requests(
  p_holder_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(r)
    FROM (
      SELECT
        req.id,
        req.merchant,
        req.product_url,
        req.order_amount,
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
      AND req.rq_status IN ('pending', 'accepted')
      ORDER BY req.created_at DESC
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Accept Request (Holder View)
-- Ahmed accepts Sara's request
-- Starts Sara's 15 min escrow lock timer from updated_at
-- Sara must lock escrow within 15 mins or request auto expires
CREATE OR REPLACE FUNCTION accept_request(
  p_request_id VARCHAR(36),
  p_holder_id VARCHAR(36)
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

  IF (extract(epoch from now()) * 1000) > v_request.expires_at THEN
    UPDATE requests 
    SET rq_status = 'expired',
        updated_at = extract(epoch from now()) * 1000
    WHERE id = p_request_id;
    RAISE EXCEPTION 'Request has expired.';
  END IF;

  UPDATE requests
  SET rq_status = 'accepted',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, requester_id, card_holder_id, merchant,
             order_amount, rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;



-- Decline Request (Holder View)
-- Ahmed declines Sara's request
-- Only works from pending state
-- Sara is freed to make a new request
CREATE OR REPLACE FUNCTION decline_request(
  p_request_id VARCHAR(36),
  p_holder_id VARCHAR(36)
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

  UPDATE requests
  SET rq_status = 'declined',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, requester_id, card_holder_id, merchant,
             order_amount, rq_status, updated_at
      FROM requests WHERE id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;



-- Submit Tracking (Holder View)
-- Ahmed submits tracking ID after placing the order
-- Only works if escrow is locked
-- Starts Sara's confirmation window — she must confirm or escrow auto releases to Ahmed
-- Updates both request and transaction status to tracking_submitted
CREATE OR REPLACE FUNCTION submit_tracking(
  p_request_id VARCHAR(36),
  p_holder_id VARCHAR(36),
  p_tracking_id VARCHAR(200),
  p_delivery_expected_at BIGINT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_txn RECORD;
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

  SELECT * INTO v_txn FROM transactions
  WHERE request_id = p_request_id;

  -- Update transaction with tracking info
  UPDATE transactions
  SET tracking_id = p_tracking_id,
      delivery_expected_at = p_delivery_expected_at,
      txn_status = 'tracking_submitted',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = v_txn.id;

  -- Update request status
  UPDATE requests
  SET rq_status = 'tracking_submitted',
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(t)
    FROM (
      SELECT id, request_id, tracking_id, delivery_expected_at,
             txn_status, updated_at
      FROM transactions WHERE id = v_txn.id
    ) t
  );
END;
$$ LANGUAGE plpgsql;



-- Get Request (Holder View)
-- Returns full request details for Ahmed
-- Delivery address only visible after escrow is locked
-- Includes transaction details if they exist
CREATE OR REPLACE FUNCTION get_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id VARCHAR(36)
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
        req.note,
        req.rq_status,
        req.expires_at,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
        c.card_type,
        c.card_tier,
        CASE
          WHEN req.rq_status IN ('escrow_locked', 'tracking_submitted', 'completed')
          THEN req.delivery_address
          ELSE NULL
        END AS delivery_address,
        row_to_json(t) AS transaction
      FROM requests req
      JOIN users u ON u.id = req.requester_id
      JOIN cards c ON c.id = req.card_id
      LEFT JOIN transactions t ON t.request_id = req.id
      WHERE req.id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;