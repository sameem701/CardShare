-- database/holder.sql

/* ─────────────────────────────────────────────────────────────
   CARD HOLDER (Ahmed)
   Flow: get_incoming_requests → accept_request / decline_request
         → submit_proof → Sara accept_proof or reject_proof
         → get_transaction_history_holder → confirm_paid
   Cancel of an accepted request writes a transaction and keeps the chat.
   Delivery address is hidden until Ahmed accepts.
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
        req.note,
        req.rq_status,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
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


-- Ahmed accepts a pending request. The address becomes visible and chat can start.
CREATE OR REPLACE FUNCTION accept_request(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_now BIGINT;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  UPDATE requests
  SET rq_status  = 'accepted',
      updated_at = v_now
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, merchant, order_amount, rq_status, updated_at
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

  DELETE FROM chat_messages WHERE thread_id = p_request_id;
  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id',    p_request_id,
    'merchant',      v_request.merchant,
    'order_amount',  v_request.order_amount,
    'result',        'declined'
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed cancels an accepted request. A reason is required.
-- Drops the old form that did not take a reason.
DROP FUNCTION IF EXISTS cancel_request_holder(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION cancel_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36),
  p_reason     TEXT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_reason  TEXT;
  v_now     BIGINT;
BEGIN
  v_reason := TRIM(p_reason);
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to cancel.';
  END IF;

  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found.';
  END IF;

  v_now    := extract(epoch from now()) * 1000;
  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, requester_name, card_holder_id, card_holder_name, merchant,
    delivery_address, order_amount,
    card_id, bank_name, card_tier,
    actual_amount_paid, screenshot_url,
    txn_status, cancel_reason,
    created_at, updated_at
  ) VALUES (
    v_txn_id,
    v_request.requester_id,
    (SELECT display_name FROM users WHERE id = v_request.requester_id),
    v_request.card_holder_id,
    (SELECT display_name FROM users WHERE id = v_request.card_holder_id),
    v_request.merchant, v_request.delivery_address,
    v_request.order_amount,
    v_request.card_id, v_card.bank_name, v_card.card_tier,
    NULL, NULL,
    'cancelled_by_holder', v_reason,
    v_now, v_now
  );

  UPDATE chat_messages
  SET thread_id = v_txn_id
  WHERE thread_id = p_request_id;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'cancelled_by_holder'
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed submits the receipt from an accepted request. The original price is
-- prefilled with Sara's figure; he can correct it here. Both numbers then lock.
-- Sara accepts or rejects the proof. Reject keeps this corrected original price.
DROP FUNCTION IF EXISTS start_shopping(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS submit_tracking(VARCHAR, VARCHAR, VARCHAR, INT);
DROP FUNCTION IF EXISTS submit_proof(VARCHAR, VARCHAR, VARCHAR, INT);

CREATE OR REPLACE FUNCTION submit_proof(
  p_request_id         VARCHAR(36),
  p_holder_id          VARCHAR(36),
  p_screenshot_url     VARCHAR(200),
  p_order_amount       INT,
  p_actual_amount_paid INT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_now     BIGINT;
BEGIN
  IF p_screenshot_url IS NULL OR TRIM(p_screenshot_url) = '' THEN
    RAISE EXCEPTION 'A screenshot is required.';
  END IF;

  IF p_order_amount IS NULL OR p_order_amount <= 100 THEN
    RAISE EXCEPTION 'Order amount must be greater than 100 PKR.';
  END IF;

  IF p_actual_amount_paid IS NULL OR p_actual_amount_paid <= 0 THEN
    RAISE EXCEPTION 'Actual amount paid must be greater than zero.';
  END IF;

  IF p_actual_amount_paid > p_order_amount THEN
    RAISE EXCEPTION 'Actual amount paid cannot exceed the order amount.';
  END IF;

  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  v_now := extract(epoch from now()) * 1000;

  UPDATE requests
  SET order_amount       = p_order_amount,
      screenshot_url     = TRIM(p_screenshot_url),
      actual_amount_paid = p_actual_amount_paid,
      rq_status          = 'proof_submitted',
      updated_at         = v_now
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, order_amount, screenshot_url, actual_amount_paid, rq_status, updated_at
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
        req.delivery_address,
        req.note,
        req.rq_status,
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.requester_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.card_holder_id = p_holder_id
      AND req.rq_status IN ('accepted', 'proof_submitted')
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
        req.note,
        req.rq_status,
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        u.display_name AS requester_name,
        c.bank_name,
        c.card_tier,
        CASE
          WHEN req.rq_status IN ('accepted', 'proof_submitted')
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
        txn.requester_id,
        txn.merchant,
        txn.order_amount,
        txn.card_id,
        txn.bank_name,
        txn.card_tier,
        txn.actual_amount_paid,
        txn.holder_share,
        txn.screenshot_url,
        txn.txn_status,
        txn.cancel_reason,
        txn.created_at,
        txn.updated_at,
        txn.requester_name
      FROM transactions txn
      WHERE txn.card_holder_id = p_holder_id
      ORDER BY txn.created_at DESC
    ) t
  );
END;
$$ LANGUAGE plpgsql;


-- Ahmed confirms the money Sara sent outside the app has reached him.
CREATE OR REPLACE FUNCTION confirm_paid(
  p_txn_id    VARCHAR(36),
  p_holder_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_now BIGINT;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  UPDATE transactions
  SET txn_status = 'paid',
      updated_at = v_now
  WHERE id = p_txn_id
  AND card_holder_id = p_holder_id
  AND txn_status = 'unpaid';

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE id = p_txn_id
      AND card_holder_id = p_holder_id
      AND txn_status = 'paid'
    ) THEN
      RAISE EXCEPTION 'Payment is already confirmed.';
    END IF;

    RAISE EXCEPTION 'Transaction not found or access denied.';
  END IF;

  RETURN json_build_object(
    'txn_id',     p_txn_id,
    'txn_status', 'paid'
  );
END;
$$ LANGUAGE plpgsql;


/* ── UNREAD CHAT ──────────────────────────────────────────────
   Same functions as above. Last-read rows are deleted when a
   pending request is declined, and retied to the cancelled
   record when an accepted request is cancelled. */

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

  DELETE FROM chat_messages WHERE thread_id = p_request_id;
  DELETE FROM chat_reads WHERE thread_id = p_request_id;
  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'request_id',    p_request_id,
    'merchant',      v_request.merchant,
    'order_amount',  v_request.order_amount,
    'result',        'declined'
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION cancel_request_holder(
  p_request_id VARCHAR(36),
  p_holder_id  VARCHAR(36),
  p_reason     TEXT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_reason  TEXT;
  v_now     BIGINT;
BEGIN
  v_reason := TRIM(p_reason);
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to cancel.';
  END IF;

  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND card_holder_id = p_holder_id
  AND rq_status = 'accepted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  SELECT * INTO v_card FROM cards WHERE id = v_request.card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found.';
  END IF;

  v_now    := extract(epoch from now()) * 1000;
  v_txn_id := uuid_generate_v4()::varchar;

  INSERT INTO transactions (
    id, requester_id, requester_name, card_holder_id, card_holder_name, merchant,
    delivery_address, order_amount,
    card_id, bank_name, card_tier,
    actual_amount_paid, screenshot_url,
    txn_status, cancel_reason,
    created_at, updated_at
  ) VALUES (
    v_txn_id,
    v_request.requester_id,
    (SELECT display_name FROM users WHERE id = v_request.requester_id),
    v_request.card_holder_id,
    (SELECT display_name FROM users WHERE id = v_request.card_holder_id),
    v_request.merchant, v_request.delivery_address,
    v_request.order_amount,
    v_request.card_id, v_card.bank_name, v_card.card_tier,
    NULL, NULL,
    'cancelled_by_holder', v_reason,
    v_now, v_now
  );

  UPDATE chat_messages
  SET thread_id = v_txn_id
  WHERE thread_id = p_request_id;

  UPDATE chat_reads
  SET thread_id = v_txn_id
  WHERE thread_id = p_request_id;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'cancelled_by_holder'
  );
END;
$$ LANGUAGE plpgsql;
