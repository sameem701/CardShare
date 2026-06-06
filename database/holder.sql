-- database/holder.sql

/* ── CARD HOLDER PROCEDURES ──────────────────────────────────── */

-- Accept a Transaction Request
CREATE OR REPLACE PROCEDURE accept_transaction(
  p_txn_id VARCHAR(36),
  p_holder_id VARCHAR(36)
) AS $$
DECLARE
  v_status VARCHAR(50);
  v_expires_at BIGINT;
  v_requester_id VARCHAR(36);
  v_merchant VARCHAR(100);
BEGIN
  SELECT status, expires_at, requester_id, merchant 
  INTO v_status, v_expires_at, v_requester_id, v_merchant
  FROM transactions 
  WHERE id = p_txn_id AND card_holder_id = p_holder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or cannot be accessed.';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Transaction is not in pending state.';
  END IF;

  IF (extract(epoch from now()) * 1000) > v_expires_at THEN
    UPDATE transactions SET status = 'expired', updated_at = extract(epoch from now()) * 1000 WHERE id = p_txn_id;
    RAISE EXCEPTION 'Request has expired.';
  END IF;

  UPDATE transactions 
  SET status = 'accepted', updated_at = extract(epoch from now()) * 1000 
  WHERE id = p_txn_id;

  CALL add_notification(
    v_requester_id, 
    'txn_accepted', 
    'Request Accepted!', 
    'Your request at ' || v_merchant || ' was accepted. Please pay into escrow to confirm.', 
    '{"transaction_id":"' || p_txn_id || '"}'
  );
END;
$$ LANGUAGE plpgsql;

-- Decline a Transaction Request
CREATE OR REPLACE PROCEDURE decline_transaction(
  p_txn_id VARCHAR(36),
  p_holder_id VARCHAR(36)
) AS $$
DECLARE
  v_status VARCHAR(50);
  v_requester_id VARCHAR(36);
  v_merchant VARCHAR(100);
BEGIN
  SELECT status, requester_id, merchant 
  INTO v_status, v_requester_id, v_merchant
  FROM transactions 
  WHERE id = p_txn_id AND card_holder_id = p_holder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or cannot be accessed.';
  END IF;

  IF v_status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Cannot decline in current state.';
  END IF;

  UPDATE transactions 
  SET status = 'declined', updated_at = extract(epoch from now()) * 1000 
  WHERE id = p_txn_id;

  CALL add_notification(
    v_requester_id, 
    'txn_declined', 
    'Request Declined', 
    'Your request at ' || v_merchant || ' was declined. You can try another circle member.', 
    '{"transaction_id":"' || p_txn_id || '"}'
  );
END;
$$ LANGUAGE plpgsql;

-- Submit Tracking Information (Order Placed)
CREATE OR REPLACE PROCEDURE submit_tracking(
  p_txn_id VARCHAR(36),
  p_holder_id VARCHAR(36),
  p_tracking_id VARCHAR(200),
  p_delivery_expected_at BIGINT
) AS $$
DECLARE
  v_status VARCHAR(50);
  v_requester_id VARCHAR(36);
  v_merchant VARCHAR(100);
BEGIN
  SELECT status, requester_id, merchant 
  INTO v_status, v_requester_id, v_merchant
  FROM transactions 
  WHERE id = p_txn_id AND card_holder_id = p_holder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found.';
  END IF;

  IF v_status != 'escrow_locked' THEN
    RAISE EXCEPTION 'Escrow is not locked or order already placed.';
  END IF;

  UPDATE transactions 
  SET status = 'order_placed', tracking_id = p_tracking_id, delivery_expected_at = p_delivery_expected_at, updated_at = extract(epoch from now()) * 1000 
  WHERE id = p_txn_id;

  CALL add_notification(
    v_requester_id, 
    'tracking_submitted', 
    'Order Placed!', 
    'Your order at ' || v_merchant || ' has been placed. Tracking: ' || p_tracking_id, 
    '{"transaction_id":"' || p_txn_id || '", "tracking_id":"' || p_tracking_id || '"}'
  );
END;
$$ LANGUAGE plpgsql;
