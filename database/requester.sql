-- database/requester.sql

/* ─────────────────────────────────────────────────────────────
   CARD REQUESTER (Sara)
   Flow: create_request → cancel_request (pending deletes; accepted writes a transaction)
         → get_active_requests_requester / get_request_requester
         → accept_proof (proof_submitted → transaction, status unpaid)
            or reject_proof (back to accepted, Ahmed can resubmit)
         → get_transaction_history_requester
   Sara pays Ahmed outside the app. No fees and no escrow.
   One Start order can go to several people. They share order_group_id.
   One live request per friend pair.
   ───────────────────────────────────────────────────────────── */


-- Sara sends one order to one or more people. Each person gets their own request
-- row and the same order_group_id. Nothing is inserted if any of them already
-- has a live order with her. p_holders is a JSON array of
-- { "card_holder_id", "card_id" }.
-- Drops the old single-holder form, and the form that also took discount_percentage.
DROP FUNCTION IF EXISTS create_request(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, TEXT, INT, INT, TEXT);
DROP FUNCTION IF EXISTS create_request(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS create_request(VARCHAR, VARCHAR, TEXT, TEXT, INT, TEXT, JSON);
DROP FUNCTION IF EXISTS create_request(VARCHAR, VARCHAR, TEXT, TEXT, INT, TEXT, JSON, JSON);

CREATE OR REPLACE FUNCTION create_request(
  p_requester_id     VARCHAR(36),
  p_merchant         VARCHAR(100),
  p_product_url      TEXT,
  p_delivery_address TEXT,
  p_order_amount     INT,
  p_note             TEXT,
  p_holders          JSON,
  p_offer            JSON DEFAULT NULL,
  p_products         JSON DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_request_id VARCHAR(36);
  v_group_id   VARCHAR(36);
  v_now        BIGINT;
  v_holder     JSON;
  v_product    JSON;
  v_sort       INT;
  v_holder_id  VARCHAR(36);
  v_card_id    VARCHAR(36);
  v_live_count INT;
  v_live_ids   JSON;
  v_phrase     TEXT;
  v_store_id   INT;
  v_percent    INT;
  v_flat       INT;
  v_cap        INT;
  v_min        INT;
  v_promo      VARCHAR(100);
  v_save       INT;
BEGIN
  IF p_order_amount <= 100 THEN
    RAISE EXCEPTION 'Order amount must be greater than 100 PKR.';
  END IF;

  -- Optional. When present: http(s), no spaces, site name ends in a letter TLD
  -- such as .pk or .com. The path after the site does not need a file ending.
  IF p_product_url IS NOT NULL AND btrim(p_product_url) <> '' THEN
    IF p_product_url ~ '[[:space:]]'
      OR p_product_url !~* '^https?://([a-z0-9-]+\.)+[a-z]{2,}([/?#][^[:space:]]*)?$'
    THEN
      RAISE EXCEPTION 'Product link must start with http:// or https://, contain no spaces, and use a site name that ends in letters such as .pk or .com.';
    END IF;
  END IF;

  IF p_holders IS NULL OR json_typeof(p_holders) <> 'array' OR json_array_length(p_holders) = 0 THEN
    RAISE EXCEPTION 'Choose at least one person.';
  END IF;

  IF json_array_length(p_holders) > 5 THEN
    RAISE EXCEPTION 'Ask up to 5 people.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM json_array_elements(p_holders) elem
    GROUP BY elem->>'card_holder_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Each person can only be included once.';
  END IF;

  FOR v_holder IN SELECT value FROM json_array_elements(p_holders)
  LOOP
    v_holder_id := NULLIF(TRIM(v_holder->>'card_holder_id'), '');
    v_card_id := NULLIF(TRIM(v_holder->>'card_id'), '');

    IF v_holder_id IS NULL OR v_card_id IS NULL THEN
      RAISE EXCEPTION 'Each person needs a card.';
    END IF;

    IF v_holder_id = p_requester_id THEN
      RAISE EXCEPTION 'You cannot request your own card.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM circle
      WHERE ((user_id = p_requester_id AND friend_id = v_holder_id)
      OR (user_id = v_holder_id AND friend_id = p_requester_id))
      AND c_status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'This user is not in your circle.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM cards
      WHERE id = v_card_id
      AND user_id = v_holder_id
      AND allow_sharing = 1
    ) THEN
      RAISE EXCEPTION 'Card not found.';
    END IF;
  END LOOP;

  PERFORM 1
  FROM requests
  WHERE requester_id = p_requester_id
  AND card_holder_id IN (
    SELECT elem->>'card_holder_id'
    FROM json_array_elements(p_holders) elem
  )
  ORDER BY card_holder_id
  FOR UPDATE;

  SELECT COUNT(*), COALESCE(json_agg(card_holder_id ORDER BY card_holder_id), '[]'::json)
  INTO v_live_count, v_live_ids
  FROM requests
  WHERE requester_id = p_requester_id
  AND card_holder_id IN (
    SELECT elem->>'card_holder_id'
    FROM json_array_elements(p_holders) elem
  );

  IF v_live_count > 0 THEN
    v_phrase := CASE WHEN v_live_count = 1 THEN '1 user' ELSE v_live_count::text || ' users' END;
    RAISE EXCEPTION 'You already have a live order with %.', v_phrase
      USING DETAIL = v_live_ids::text;
  END IF;

  v_group_id := uuid_generate_v4()::varchar;
  v_now := extract(epoch from now()) * 1000;

  IF p_offer IS NOT NULL AND json_typeof(p_offer) = 'object' THEN
    v_store_id := NULLIF(p_offer->>'store_id', '')::int;
    v_percent := NULLIF(p_offer->>'discount_percent', '')::int;
    v_flat := NULLIF(p_offer->>'discount_flat_pkr', '')::int;
    v_cap := NULLIF(p_offer->>'cap_pkr', '')::int;
    v_min := NULLIF(p_offer->>'min_order_pkr', '')::int;
    v_promo := NULLIF(btrim(p_offer->>'promo_code'), '');
    v_save := NULLIF(p_offer->>'estimated_save_pkr', '')::int;
    IF v_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE id = v_store_id) THEN
      RAISE EXCEPTION 'Store not found.';
    END IF;
  END IF;

  FOR v_holder IN SELECT value FROM json_array_elements(p_holders)
  LOOP
    v_request_id := uuid_generate_v4()::varchar;
    v_holder_id := TRIM(v_holder->>'card_holder_id');
    v_card_id := TRIM(v_holder->>'card_id');

    INSERT INTO requests (
      id, order_group_id, requester_id, card_holder_id, card_id, merchant,
      product_url, delivery_address, order_amount, note,
      rq_status, created_at, updated_at,
      store_id, discount_percent, discount_flat_pkr, cap_pkr, min_order_pkr,
      promo_code, estimated_save_pkr
    ) VALUES (
      v_request_id, v_group_id, p_requester_id, v_holder_id, v_card_id, p_merchant,
      p_product_url, p_delivery_address, p_order_amount, p_note,
      'pending',
      v_now,
      v_now,
      v_store_id, v_percent, v_flat, v_cap, v_min, v_promo, v_save
    );
  END LOOP;

  IF p_products IS NOT NULL AND json_typeof(p_products) = 'array' THEN
    v_sort := 0;
    FOR v_product IN SELECT value FROM json_array_elements(p_products)
    LOOP
      INSERT INTO request_products (
        id, order_group_id, title, product_url, note, qty, sort_order, created_at
      ) VALUES (
        uuid_generate_v4()::varchar,
        v_group_id,
        NULLIF(btrim(COALESCE(v_product->>'title', v_product->>'name', '')), ''),
        NULLIF(btrim(COALESCE(v_product->>'product_url', v_product->>'url', '')), ''),
        NULLIF(btrim(COALESCE(v_product->>'note', '')), ''),
        GREATEST(1, LEAST(99, COALESCE(NULLIF(v_product->>'qty', '')::int, 1))),
        v_sort,
        v_now
      );
      v_sort := v_sort + 1;
    END LOOP;
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(r), '[]'::json)
    FROM (
      SELECT id, order_group_id, requester_id, card_holder_id, card_id, merchant,
             product_url, order_amount, note, rq_status, created_at
      FROM requests
      WHERE order_group_id = v_group_id
      ORDER BY id
    ) r
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT COUNT(*), COALESCE(json_agg(card_holder_id ORDER BY card_holder_id), '[]'::json)
    INTO v_live_count, v_live_ids
    FROM requests
    WHERE requester_id = p_requester_id
    AND card_holder_id IN (
      SELECT elem->>'card_holder_id'
      FROM json_array_elements(p_holders) elem
    );

    IF v_live_count = 0 THEN
      v_live_count := 1;
    END IF;

    v_phrase := CASE WHEN v_live_count = 1 THEN '1 user' ELSE v_live_count::text || ' users' END;
    RAISE EXCEPTION 'You already have a live order with %.', v_phrase
      USING DETAIL = COALESCE(v_live_ids::text, '[]');
END;
$$ LANGUAGE plpgsql;


-- Sara cancels. Pending deletes the request. Accepted writes a cancelled transaction.
-- Drops the old form that did not take a reason.
DROP FUNCTION IF EXISTS cancel_request(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION cancel_request(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_reason       TEXT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_reason  TEXT;
  v_now     BIGINT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status IN ('pending', 'accepted')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status = 'pending' THEN
    DELETE FROM chat_messages
    WHERE thread_id IN (
      SELECT id FROM requests
      WHERE order_group_id = v_request.order_group_id
        AND rq_status = 'pending'
    );
    DELETE FROM chat_reads
    WHERE thread_id IN (
      SELECT id FROM requests
      WHERE order_group_id = v_request.order_group_id
        AND rq_status = 'pending'
    );
    DELETE FROM requests
    WHERE order_group_id = v_request.order_group_id
      AND rq_status = 'pending';
    DELETE FROM request_products
    WHERE order_group_id = v_request.order_group_id
      AND NOT EXISTS (
        SELECT 1 FROM requests r WHERE r.order_group_id = v_request.order_group_id
      );

    RETURN json_build_object(
      'request_id',      p_request_id,
      'merchant',        v_request.merchant,
      'order_amount',    v_request.order_amount,
      'card_holder_id',  v_request.card_holder_id,
      'previous_status', v_request.rq_status,
      'result',          'cancelled'
    );
  END IF;

  v_reason := TRIM(p_reason);
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to cancel.';
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
    'cancelled_by_requester', v_reason,
    v_now, v_now
  );

  UPDATE chat_messages
  SET thread_id = v_txn_id
  WHERE thread_id = p_request_id;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'cancelled_by_requester'
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
        req.delivery_address,
        req.note,
        req.rq_status,
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        req.store_id,
        req.discount_percent,
        req.discount_flat_pkr,
        req.cap_pkr,
        req.min_order_pkr,
        req.promo_code,
        req.estimated_save_pkr,
        req.order_group_id,
        req.holder_reply,
        (
          SELECT COUNT(*)::int FROM requests g
          WHERE g.order_group_id = req.order_group_id
            AND g.rq_status = 'pending'
        ) AS group_size,
        request_products_json(req.order_group_id) AS products,
        u.display_name AS card_holder_name,
        c.bank_name,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.card_holder_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.requester_id = p_requester_id
      AND req.rq_status IN ('pending', 'accepted', 'proof_submitted')
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
        req.delivery_address,
        req.note,
        req.rq_status,
        req.actual_amount_paid,
        req.screenshot_url,
        req.created_at,
        req.updated_at,
        req.store_id,
        req.discount_percent,
        req.discount_flat_pkr,
        req.cap_pkr,
        req.min_order_pkr,
        req.promo_code,
        req.estimated_save_pkr,
        req.order_group_id,
        req.holder_reply,
        (
          SELECT COUNT(*)::int FROM requests g
          WHERE g.order_group_id = req.order_group_id
            AND g.rq_status = 'pending'
        ) AS group_size,
        request_products_json(req.order_group_id) AS products,
        u.display_name AS card_holder_name,
        c.bank_name,
        c.card_tier
      FROM requests req
      JOIN users u ON u.id = req.card_holder_id
      JOIN cards c ON c.id = req.card_id
      WHERE req.id = p_request_id
    ) r
  );
END;
$$ LANGUAGE plpgsql;


DROP FUNCTION IF EXISTS lock_escrow(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS confirm_tracking(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS raise_dispute(VARCHAR, VARCHAR, TEXT);

-- Sara accepts Ahmed's proof. The request becomes a transaction with status unpaid.
-- Chat is moved onto the transaction id before the request is deleted.
CREATE OR REPLACE FUNCTION accept_proof(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_now     BIGINT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status = 'proof_submitted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or proof is not waiting.';
  END IF;

  IF v_request.actual_amount_paid IS NULL OR v_request.screenshot_url IS NULL THEN
    RAISE EXCEPTION 'Proof is missing the amount or the screenshot.';
  END IF;

  IF v_request.actual_amount_paid > v_request.order_amount THEN
    RAISE EXCEPTION 'Actual amount paid cannot exceed the order amount.';
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
    actual_amount_paid, holder_share, screenshot_url, txn_status,
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
    v_request.actual_amount_paid,
    ROUND((v_request.order_amount - v_request.actual_amount_paid) * 0.2)::INT,
    v_request.screenshot_url, 'unpaid',
    v_now, v_now
  );

  UPDATE chat_messages
  SET thread_id = v_txn_id
  WHERE thread_id = p_request_id;

  DELETE FROM requests WHERE id = p_request_id;

  RETURN json_build_object(
    'txn_id',     v_txn_id,
    'txn_status', 'unpaid'
  );
END;
$$ LANGUAGE plpgsql;


-- Sara rejects the proof. The request stays so Ahmed can submit again.
CREATE OR REPLACE FUNCTION reject_proof(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_now BIGINT;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  UPDATE requests
  SET rq_status          = 'accepted',
      screenshot_url     = NULL,
      actual_amount_paid = NULL,
      updated_at         = v_now
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status = 'proof_submitted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or proof is not waiting.';
  END IF;

  RETURN json_build_object(
    'request_id', p_request_id,
    'rq_status',  'accepted'
  );
END;
$$ LANGUAGE plpgsql;


-- Paid and cancelled orders only. An unpaid order stays off history.
CREATE OR REPLACE FUNCTION get_transaction_history_requester(
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(t), '[]'::json)
    FROM (
      SELECT
        txn.id,
        txn.card_holder_id,
        txn.merchant,
        txn.delivery_address,
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
        txn.card_holder_name
      FROM transactions txn
      WHERE txn.requester_id = p_requester_id
      AND txn.txn_status IN ('paid', 'cancelled_by_requester', 'cancelled_by_holder')
      ORDER BY txn.created_at DESC
    ) t
  );
END;
$$ LANGUAGE plpgsql;


/* ── UNREAD CHAT ──────────────────────────────────────────────
   Same functions as above. Last-read rows follow the chat:
   deleted with a pending cancel, retied when an accepted cancel
   moves the messages onto the cancelled record, and retied when
   accepted proof moves them onto the payment record. */

CREATE OR REPLACE FUNCTION cancel_request(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_reason       TEXT
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_reason  TEXT;
  v_now     BIGINT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status IN ('pending', 'accepted')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  IF v_request.rq_status = 'pending' THEN
    DELETE FROM chat_messages WHERE thread_id = p_request_id;
    DELETE FROM chat_reads WHERE thread_id = p_request_id;
    DELETE FROM requests WHERE id = p_request_id;

    RETURN json_build_object(
      'request_id',      p_request_id,
      'merchant',        v_request.merchant,
      'order_amount',    v_request.order_amount,
      'card_holder_id',  v_request.card_holder_id,
      'previous_status', v_request.rq_status,
      'result',          'cancelled'
    );
  END IF;

  v_reason := TRIM(p_reason);
  IF v_reason IS NULL OR v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to cancel.';
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
    'cancelled_by_requester', v_reason,
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
    'txn_status', 'cancelled_by_requester'
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION accept_proof(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
  v_card    RECORD;
  v_txn_id  VARCHAR(36);
  v_now     BIGINT;
BEGIN
  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status = 'proof_submitted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or proof is not waiting.';
  END IF;

  IF v_request.actual_amount_paid IS NULL OR v_request.screenshot_url IS NULL THEN
    RAISE EXCEPTION 'Proof is missing the amount or the screenshot.';
  END IF;

  IF v_request.actual_amount_paid > v_request.order_amount THEN
    RAISE EXCEPTION 'Actual amount paid cannot exceed the order amount.';
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
    actual_amount_paid, holder_share, screenshot_url, txn_status,
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
    v_request.actual_amount_paid,
    ROUND((v_request.order_amount - v_request.actual_amount_paid) * 0.2)::INT,
    v_request.screenshot_url, 'unpaid',
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
    'txn_status', 'unpaid'
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION replace_request_products(
  p_group_id     VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_products     JSON
) RETURNS JSON AS $$
DECLARE
  v_now     BIGINT;
  v_product JSON;
  v_sort    INT := 0;
  v_title   TEXT;
  v_url     TEXT;
  v_note    TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE order_group_id = p_group_id
      AND requester_id = p_requester_id
      AND rq_status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'Request not found or products cannot be changed now.';
  END IF;

  IF p_products IS NULL OR json_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'Products are required.';
  END IF;

  v_now := extract(epoch from now()) * 1000;
  DELETE FROM request_products WHERE order_group_id = p_group_id;

  FOR v_product IN SELECT value FROM json_array_elements(p_products)
  LOOP
    v_title := NULLIF(btrim(COALESCE(v_product->>'title', v_product->>'name', '')), '');
    v_url := NULLIF(btrim(COALESCE(v_product->>'product_url', v_product->>'url', '')), '');
    v_note := NULLIF(btrim(COALESCE(v_product->>'note', '')), '');
    IF v_title IS NULL AND v_url IS NULL THEN
      CONTINUE;
    END IF;
    INSERT INTO request_products (
      id, order_group_id, title, product_url, note, qty, sort_order, created_at
    ) VALUES (
      uuid_generate_v4()::varchar,
      p_group_id,
      v_title,
      v_url,
      v_note,
      GREATEST(1, LEAST(99, COALESCE(NULLIF(v_product->>'qty', '')::int, 1))),
      v_sort,
      v_now
    );
    v_sort := v_sort + 1;
  END LOOP;

  UPDATE requests SET updated_at = v_now, product_url = (
    SELECT product_url FROM request_products
    WHERE order_group_id = p_group_id
    ORDER BY sort_order
    LIMIT 1
  )
  WHERE order_group_id = p_group_id
    AND requester_id = p_requester_id
    AND rq_status IN ('pending', 'accepted');

  INSERT INTO chat_messages (id, thread_id, sender_id, chat_message, created_at)
  SELECT uuid_generate_v4()::varchar, req.id, p_requester_id, 'Updated the products on this order.', v_now
  FROM requests req
  WHERE req.order_group_id = p_group_id
    AND req.requester_id = p_requester_id
    AND req.rq_status IN ('accepted', 'proof_submitted');

  RETURN request_products_json(p_group_id);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_order_group_requester(
  p_group_id     VARCHAR(36),
  p_requester_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_head RECORD;
BEGIN
  SELECT * INTO v_head
  FROM requests
  WHERE order_group_id = p_group_id
    AND requester_id = p_requester_id
  ORDER BY
    CASE rq_status WHEN 'accepted' THEN 0 WHEN 'proof_submitted' THEN 1 ELSE 2 END,
    created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  RETURN (
    SELECT json_build_object(
      'order_group_id', p_group_id,
      'merchant', v_head.merchant,
      'order_amount', v_head.order_amount,
      'delivery_address', v_head.delivery_address,
      'note', v_head.note,
      'product_url', v_head.product_url,
      'rq_status', v_head.rq_status,
      'chosen_request_id', CASE WHEN v_head.rq_status <> 'pending' THEN v_head.id ELSE NULL END,
      'products', request_products_json(p_group_id),
      'members', (
        SELECT COALESCE(json_agg(row_to_json(m) ORDER BY m.save_pkr DESC NULLS LAST, m.display_name), '[]'::json)
        FROM (
          SELECT
            req.id AS request_id,
            req.card_holder_id,
            req.holder_reply,
            req.rq_status,
            req.card_id,
            req.store_id,
            req.discount_percent,
            req.discount_flat_pkr,
            req.cap_pkr,
            req.min_order_pkr,
            req.promo_code,
            req.estimated_save_pkr AS save_pkr,
            u.display_name,
            c.bank_name,
            c.card_tier
          FROM requests req
          JOIN users u ON u.id = req.card_holder_id
          JOIN cards c ON c.id = req.card_id
          WHERE req.order_group_id = p_group_id
            AND req.requester_id = p_requester_id
        ) m
      )
    )
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION choose_broadcast_holder(
  p_group_id     VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_holder_id    VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_request_id VARCHAR(36);
  v_now        BIGINT;
BEGIN
  PERFORM 1
  FROM requests
  WHERE order_group_id = p_group_id
    AND requester_id = p_requester_id
    AND rq_status = 'pending'
  ORDER BY id
  FOR UPDATE;

  SELECT id INTO v_request_id
  FROM requests
  WHERE order_group_id = p_group_id
    AND requester_id = p_requester_id
    AND card_holder_id = p_holder_id
    AND rq_status = 'pending'
    AND holder_reply = 'available';

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'That person is not available for this request.';
  END IF;

  v_now := extract(epoch from now()) * 1000;

  UPDATE requests
  SET rq_status = 'accepted',
      updated_at = v_now
  WHERE id = v_request_id;

  DELETE FROM chat_messages
  WHERE thread_id IN (
    SELECT id FROM requests
    WHERE order_group_id = p_group_id
      AND id <> v_request_id
      AND rq_status = 'pending'
  );

  DELETE FROM chat_reads
  WHERE thread_id IN (
    SELECT id FROM requests
    WHERE order_group_id = p_group_id
      AND id <> v_request_id
      AND rq_status = 'pending'
  );

  DELETE FROM requests
  WHERE order_group_id = p_group_id
    AND id <> v_request_id
    AND rq_status = 'pending';

  RETURN json_build_object(
    'request_id', v_request_id,
    'order_group_id', p_group_id,
    'rq_status', 'accepted'
  );
END;
$$ LANGUAGE plpgsql;
