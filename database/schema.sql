-- database/schema.sql
--
-- MVP: no in-app payments. Amounts are whole PKR.
-- Sara pays Ahmed outside the app after she accepts his proof.
-- Ahmed sets transactions.paid when that money has reached him.

/* ── EXTENSIONS ────────────────────────────────────────────── */
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/* ── USERS ──────────────────────────────────────────────────── */
-- Login is phone + OTP. Display name is the only profile field.
-- Onboarding is done when display_name is set. No PIN, device binding, or payout data.
CREATE TABLE IF NOT EXISTS users (
  id             VARCHAR(36) PRIMARY KEY,
  phone          VARCHAR(20) UNIQUE NOT NULL,
  display_name   VARCHAR(100),
  created_at     BIGINT NOT NULL
);

/* ── OTPs ───────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS otps (
  phone        VARCHAR(20) PRIMARY KEY,
  otp_hash     TEXT NOT NULL,
  expires_at   BIGINT NOT NULL,
  last_sent_at BIGINT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  resend_count INT NOT NULL DEFAULT 0
);

/* ── OTP PHONE LOCKOUT ──────────────────────────────────────── */
-- Phone-wide OTP ban after 6 failed verifies in a round.
-- fail_round escalation: 1 day → 2 → 4 → 10 → permanently blocked (contact support).
CREATE TABLE IF NOT EXISTS otp_phone_lockout (
  phone               VARCHAR(20) PRIMARY KEY,
  verify_fail_count   INT NOT NULL DEFAULT 0,
  fail_round          INT NOT NULL DEFAULT 0,
  blocked_until       BIGINT,
  permanently_blocked INT NOT NULL DEFAULT 0
);

/* ── SESSIONS ────────────────────────────────────────────────── */
-- One active login per user. The app sends this id on each request.
-- Logout deletes the row. No JWT and no refresh token.
CREATE TABLE IF NOT EXISTS sessions (
  id      VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);

/* ── CARDS ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS cards (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  bank_name     VARCHAR(100) NOT NULL CHECK (bank_name IN ('HBL', 'MCB', 'UBL', 'Meezan', 'Bank Alfalah', 'Faysal Bank', 'Standard Chartered', 'Askari', 'Silk Bank', 'Allied Bank', 'Habib Metro', 'JS Bank', 'Soneri Bank', 'Bank Al Habib')),
  card_type     VARCHAR(50) NOT NULL CHECK (card_type IN ('Visa', 'Mastercard', 'UnionPay', 'PayPak', 'Amex')),
  card_tier     VARCHAR(50) NOT NULL CHECK (card_tier IN ('Classic', 'Gold', 'Platinum', 'Titanium', 'Signature', 'World')),
  allow_sharing INT NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL
);

/* ── CIRCLE (trust network) ─────────────────────────────────── */
CREATE TABLE IF NOT EXISTS circle (
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id),
  friend_id  VARCHAR(36) NOT NULL REFERENCES users(id),
  c_status   VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (c_status IN ('pending', 'accepted', 'declined')),
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

/* ── REQUESTS ───────────────────────────────────────────────── */
-- Live order. Deleted when Sara accepts Ahmed's proof; a transactions row replaces it.
-- rq_status:
--   pending          — Sara created the request
--   accepted         — Ahmed accepted; they chat before he can shop
--   shopping         — both have chatted; Ahmed can see the address and shop
--   proof_submitted  — Ahmed sent the receipt and actual_amount_paid; waiting on Sara
-- Saving is order_amount - actual_amount_paid. No stored discount or fee.
CREATE TABLE IF NOT EXISTS requests (
  id                 VARCHAR(36) PRIMARY KEY,
  requester_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  card_holder_id     VARCHAR(36) NOT NULL REFERENCES users(id),
  card_id            VARCHAR(36) NOT NULL REFERENCES cards(id),
  merchant           VARCHAR(100) NOT NULL,
  product_url        TEXT,
  delivery_address   TEXT NOT NULL,
  order_amount       INT NOT NULL CHECK (order_amount > 100),
  note               TEXT,
  screenshot_url     VARCHAR(200),
  actual_amount_paid INT,
  rq_status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (rq_status IN ('pending', 'accepted', 'shopping', 'proof_submitted')),
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);

/* ── TRANSACTIONS ───────────────────────────────────────────── */
-- Created when Sara accepts the proof. The request row is deleted.
-- paid is false until Ahmed confirms he received the money outside the app.
-- Card fields are copied so history survives if the card is later changed or deleted.
CREATE TABLE IF NOT EXISTS transactions (
  id                 VARCHAR(36) PRIMARY KEY,
  requester_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  card_holder_id     VARCHAR(36) NOT NULL REFERENCES users(id),
  merchant           VARCHAR(100) NOT NULL,
  product_url        TEXT,
  delivery_address   TEXT NOT NULL,
  order_amount       INT NOT NULL,
  note               TEXT,
  bank_name          VARCHAR(100) NOT NULL,
  card_type          VARCHAR(50) NOT NULL,
  card_tier          VARCHAR(50) NOT NULL,
  actual_amount_paid INT,
  screenshot_url     VARCHAR(200),
  paid               BOOLEAN NOT NULL DEFAULT false,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);

/* ── CHAT ───────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS chat_messages (
  id              VARCHAR(36) PRIMARY KEY,
  request_id      VARCHAR(36) NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  chat_message    TEXT,
  attachment_path VARCHAR(200),
  created_at      BIGINT NOT NULL,
  CONSTRAINT chat_message_has_content CHECK (
    chat_message IS NOT NULL OR attachment_path IS NOT NULL
  )
);


/* ── INDEXES for performance ────────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_otps_phone          ON otps(phone);
CREATE INDEX IF NOT EXISTS idx_cards_user          ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_user         ON circle(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_friend       ON circle(friend_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester  ON requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_holder     ON requests(card_holder_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester_holder ON requests(requester_id, card_holder_id);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(rq_status);
CREATE INDEX IF NOT EXISTS idx_txn_requester       ON transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_txn_holder          ON transactions(card_holder_id);
CREATE INDEX IF NOT EXISTS idx_chat_request        ON chat_messages(request_id);


/* ─────────────────────────────────────────────────────────────
   AUTH
   Flow: store_otp → verify_otp (creates the user if new)
         OTP limits: 60s cooldown, 1 resend, 3 tries/code, 6 fails/round → otp_phone_lockout
         Success clears otp_phone_lockout row for that phone
         → backend calls create_session
         → auth checks the session row with validate_session
         Setup is update_profile. A null display_name means the name is not set.
   ───────────────────────────────────────────────────────────── */

-- Internal helper — creates user row on first OTP verification
-- Never called directly by the backend — only used inside verify_otp
CREATE OR REPLACE FUNCTION login_or_create_user(
  p_phone VARCHAR(20)
) RETURNS JSON AS $$
DECLARE
  v_user_id VARCHAR(36);
BEGIN
  SELECT id INTO v_user_id FROM users WHERE phone = p_phone;

  IF NOT FOUND THEN
    v_user_id := uuid_generate_v4()::varchar;
    INSERT INTO users (id, phone, created_at)
    VALUES (v_user_id, p_phone, extract(epoch from now()) * 1000);
  END IF;

  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, phone, display_name, created_at
      FROM users WHERE id = v_user_id
    ) u
  );
END;
$$ LANGUAGE plpgsql;


-- Backend generates OTP and stores its hash before sending SMS
-- Enforces: phone lockout, 60s cooldown, max 1 resend (2 codes per round)
CREATE OR REPLACE PROCEDURE store_otp(
  p_phone      VARCHAR(20),
  p_otp_hash   TEXT,
  p_expires_at BIGINT
) AS $$
DECLARE
  v_now  BIGINT;
  v_lock RECORD;
  v_otp  RECORD;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  SELECT * INTO v_lock FROM otp_phone_lockout WHERE phone = p_phone;
  IF FOUND THEN
    IF v_lock.permanently_blocked = 1 THEN
      RAISE EXCEPTION 'OTP_CONTACT_SUPPORT';
    ELSIF v_lock.blocked_until IS NOT NULL AND v_lock.blocked_until > v_now THEN
      RAISE EXCEPTION 'OTP_LOCKED:%', v_lock.blocked_until;
    END IF;
  END IF;

  SELECT * INTO v_otp FROM otps WHERE phone = p_phone;

  IF FOUND THEN
    IF v_now < v_otp.expires_at THEN
      IF v_now - v_otp.last_sent_at < 60000 THEN
        RAISE EXCEPTION 'OTP_COOLDOWN:%', (60000 - (v_now - v_otp.last_sent_at));
      END IF;

      IF v_otp.resend_count >= 1 THEN
        RAISE EXCEPTION 'Maximum OTP resends reached. Please verify your code.';
      END IF;

      UPDATE otps
      SET otp_hash     = p_otp_hash,
          expires_at   = p_expires_at,
          last_sent_at = v_now,
          attempts     = 0,
          resend_count = resend_count + 1
      WHERE phone = p_phone;
    ELSE
      UPDATE otps
      SET otp_hash     = p_otp_hash,
          expires_at   = p_expires_at,
          last_sent_at = v_now,
          attempts     = 0,
          resend_count = 0
      WHERE phone = p_phone;
    END IF;
  ELSE
    INSERT INTO otps (phone, otp_hash, expires_at, last_sent_at, attempts, resend_count)
    VALUES (p_phone, p_otp_hash, p_expires_at, v_now, 0, 0);
  END IF;
END;
$$ LANGUAGE plpgsql;





-- Replaces any existing session for this user (one active session per user)
CREATE OR REPLACE FUNCTION create_session(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_session_id VARCHAR(36);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  DELETE FROM sessions WHERE user_id = p_user_id;

  v_session_id := uuid_generate_v4()::varchar;

  INSERT INTO sessions (id, user_id)
  VALUES (v_session_id, p_user_id);

  RETURN json_build_object('session_id', v_session_id);
END;
$$ LANGUAGE plpgsql;


-- Session row must exist; device_id checked against users.device_id (not stored on sessions)
-- Replaces the old 3-arg form that also checked device_id.
DROP FUNCTION IF EXISTS validate_session(VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION validate_session(
  p_session_id VARCHAR(36),
  p_user_id    VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session FROM sessions
  WHERE id = p_session_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session revoked. Please log in again.';
  END IF;

  RETURN json_build_object(
    'session_id', v_session.id,
    'user_id',    v_session.user_id
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE PROCEDURE revoke_session(
  p_session_id VARCHAR(36)
) AS $$
BEGIN
  DELETE FROM sessions WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE PROCEDURE revoke_user_sessions(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  DELETE FROM sessions WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- Explicit logout: delete this user's session.
CREATE OR REPLACE PROCEDURE logout_user(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  CALL revoke_user_sessions(p_user_id);
END;
$$ LANGUAGE plpgsql;



-- User submits OTP — checks expiry, attempt limit, then hash.
-- On success: creates the user if new and returns id, phone, display_name, created_at.
-- The backend then calls create_session.
DROP FUNCTION IF EXISTS verify_otp(VARCHAR, TEXT, VARCHAR);

CREATE OR REPLACE FUNCTION verify_otp(
  p_phone    VARCHAR(20),
  p_otp_hash TEXT
) RETURNS JSON AS $$
DECLARE
  v_otp        RECORD;
  v_user       JSON;
  v_user_id    VARCHAR(36);
  v_lock       RECORD;
  v_now        BIGINT;
  v_fail_count INT;
  v_round      INT;
  v_days       INT;
  v_until      BIGINT;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  SELECT * INTO v_lock FROM otp_phone_lockout WHERE phone = p_phone;
  IF FOUND THEN
    IF v_lock.permanently_blocked = 1 THEN
      RAISE EXCEPTION 'OTP_CONTACT_SUPPORT';
    ELSIF v_lock.blocked_until IS NOT NULL AND v_lock.blocked_until > v_now THEN
      RAISE EXCEPTION 'OTP_LOCKED:%', v_lock.blocked_until;
    END IF;
  END IF;

  SELECT * INTO v_otp FROM otps WHERE phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No OTP found for this number.';
  END IF;

  IF v_now > v_otp.expires_at THEN
    DELETE FROM otps WHERE phone = p_phone;
    RAISE EXCEPTION 'OTP has expired.';
  END IF;

  IF v_otp.attempts >= 3 THEN
    RAISE EXCEPTION 'Maximum attempts reached. Please request a new OTP.';
  END IF;

  IF v_otp.otp_hash != p_otp_hash THEN
    UPDATE otps SET attempts = attempts + 1 WHERE phone = p_phone;

    INSERT INTO otp_phone_lockout (phone, verify_fail_count, fail_round, permanently_blocked)
    VALUES (p_phone, 0, 0, 0)
    ON CONFLICT (phone) DO NOTHING;

    UPDATE otp_phone_lockout
    SET verify_fail_count = verify_fail_count + 1
    WHERE phone = p_phone
    RETURNING verify_fail_count, fail_round INTO v_fail_count, v_round;

    IF v_fail_count >= 6 THEN
      v_round := v_round + 1;

      IF v_round >= 5 THEN
        UPDATE otp_phone_lockout
        SET fail_round          = v_round,
            verify_fail_count   = 0,
            blocked_until       = NULL,
            permanently_blocked = 1
        WHERE phone = p_phone;

        DELETE FROM otps WHERE phone = p_phone;
        RAISE EXCEPTION 'OTP_CONTACT_SUPPORT';
      END IF;

      v_days := CASE v_round
        WHEN 1 THEN 1
        WHEN 2 THEN 2
        WHEN 3 THEN 4
        WHEN 4 THEN 10
        ELSE 10
      END;

      v_until := v_now + (v_days::bigint * 86400000);

      UPDATE otp_phone_lockout
      SET fail_round          = v_round,
          verify_fail_count   = 0,
          blocked_until       = v_until,
          permanently_blocked = 0
      WHERE phone = p_phone;

      DELETE FROM otps WHERE phone = p_phone;
      RAISE EXCEPTION 'OTP_LOCKED:%', v_until;
    END IF;

    RAISE EXCEPTION 'Invalid OTP.';
  END IF;

  DELETE FROM otps WHERE phone = p_phone;
  DELETE FROM otp_phone_lockout WHERE phone = p_phone;

  v_user := login_or_create_user(p_phone);
  v_user_id := (v_user->>'id');

  RETURN (
    SELECT json_build_object(
      'id',           id,
      'phone',        phone,
      'display_name', display_name,
      'created_at',   created_at
    )
    FROM users WHERE id = v_user_id
  );
END;
$$ LANGUAGE plpgsql;



/* ─────────────────────────────────────────────────────────────
   PROFILE
   Setup is the display name. A null display_name means it is not set.
   ───────────────────────────────────────────────────────────── */

-- User sets their display name. A blank name is rejected.
CREATE OR REPLACE PROCEDURE update_profile(
  p_user_id      VARCHAR(36),
  p_display_name VARCHAR(100)
) AS $$
DECLARE
  v_name VARCHAR(100);
BEGIN
  v_name := TRIM(p_display_name);

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Display name is required.';
  END IF;

  UPDATE users
  SET display_name = v_name
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Returns the user row. A null display_name means setup is unfinished.
CREATE OR REPLACE FUNCTION get_profile(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, phone, display_name, created_at
      FROM users
      WHERE id = p_user_id
    ) u
  );
END;
$$ LANGUAGE plpgsql;



-- Looks up a user by phone before adding them to circle
-- Returns id and display_name only — no sensitive fields exposed
CREATE OR REPLACE FUNCTION find_user_by_phone(
  p_phone VARCHAR(20)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, display_name
      FROM users WHERE phone = p_phone
    ) u
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   PAYOUT VAULT — holder payout destination (encrypted in Node)
   Flow: backend verifies + encrypts → save_payout_destination → mark_payout_verified
   Real money moves at the PSP; DB stores only ciphertext + masked display.
   State is derived from the vault row via get_payout_state (no status column).
   ───────────────────────────────────────────────────────────── */

-- Legacy PSP payout procedures (replaced by the vault procedures below)
DROP PROCEDURE IF EXISTS set_payout_verified(VARCHAR, VARCHAR);
DROP PROCEDURE IF EXISTS set_payout_failed(VARCHAR);
DROP PROCEDURE IF EXISTS clear_payout(VARCHAR);

-- 'none' | 'pending' | 'verified' — single source of truth for payout readiness
CREATE OR REPLACE FUNCTION get_payout_state(
  p_user_id VARCHAR(36)
) RETURNS VARCHAR AS $$
DECLARE
  v_verified_at BIGINT;
BEGIN
  SELECT verified_at INTO v_verified_at
  FROM payout_vault WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF v_verified_at IS NULL THEN
    RETURN 'pending';
  END IF;

  RETURN 'verified';
END;
$$ LANGUAGE plpgsql STABLE;


-- True while the user (as holder) has an order that still depends on their payout destination
CREATE OR REPLACE FUNCTION holder_has_active_order(
  p_user_id VARCHAR(36)
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM requests
    WHERE card_holder_id = p_user_id
    AND rq_status IN ('payment_pending', 'escrow_locked', 'tracking_submitted')
  );
$$ LANGUAGE sql STABLE;


-- Backend passes already-encrypted fields. Always lands as pending (verified_at NULL);
-- call mark_payout_verified after the title/verify step succeeds.
-- Replacing a verified destination starts the 24h accept cooldown.
CREATE OR REPLACE PROCEDURE save_payout_destination(
  p_user_id        VARCHAR(36),
  p_ciphertext     TEXT,
  p_iv             TEXT,
  p_auth_tag       TEXT,
  p_key_version    INT,
  p_channel        VARCHAR(50),
  p_bank_name      VARCHAR(100),
  p_masked_display VARCHAR(50)
) AS $$
DECLARE
  v_now      BIGINT;
  v_existing RECORD;
BEGIN
  IF p_ciphertext IS NULL OR TRIM(p_ciphertext) = ''
     OR p_iv IS NULL OR TRIM(p_iv) = ''
     OR p_auth_tag IS NULL OR TRIM(p_auth_tag) = '' THEN
    RAISE EXCEPTION 'Encrypted payout data is required.';
  END IF;

  IF p_channel IS NULL OR TRIM(p_channel) = '' THEN
    RAISE EXCEPTION 'Payout channel is required.';
  END IF;

  IF p_masked_display IS NULL OR TRIM(p_masked_display) = '' THEN
    RAISE EXCEPTION 'Masked display is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  v_now := extract(epoch from now()) * 1000;

  SELECT verified_at, relinked_at INTO v_existing
  FROM payout_vault WHERE user_id = p_user_id FOR UPDATE;

  IF FOUND AND holder_has_active_order(p_user_id) THEN
    RAISE EXCEPTION 'You cannot change your payout account while you have an active order.';
  END IF;

  INSERT INTO payout_vault (
    user_id, ciphertext, iv, auth_tag, key_version,
    channel, bank_name, masked_display,
    verified_at, relinked_at, created_at, updated_at
  ) VALUES (
    p_user_id, p_ciphertext, p_iv, p_auth_tag, COALESCE(p_key_version, 1),
    TRIM(p_channel), NULLIF(TRIM(COALESCE(p_bank_name, '')), ''), TRIM(p_masked_display),
    NULL, NULL, v_now, v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET ciphertext     = EXCLUDED.ciphertext,
      iv             = EXCLUDED.iv,
      auth_tag       = EXCLUDED.auth_tag,
      key_version    = EXCLUDED.key_version,
      channel        = EXCLUDED.channel,
      bank_name      = EXCLUDED.bank_name,
      masked_display = EXCLUDED.masked_display,
      verified_at    = NULL,
      relinked_at    = CASE
                         WHEN v_existing.verified_at IS NOT NULL THEN v_now
                         ELSE payout_vault.relinked_at
                       END,
      updated_at     = v_now;
END;
$$ LANGUAGE plpgsql;


-- Called after the verify step (title fetch) succeeds
CREATE OR REPLACE PROCEDURE mark_payout_verified(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  UPDATE payout_vault
  SET verified_at = extract(epoch from now()) * 1000,
      updated_at  = extract(epoch from now()) * 1000
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payout account to verify. Link a payout account first.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Holder removes their payout destination (blocked while an order depends on it)
CREATE OR REPLACE PROCEDURE remove_payout(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  IF holder_has_active_order(p_user_id) THEN
    RAISE EXCEPTION 'You cannot remove your payout account while you have an active order.';
  END IF;

  DELETE FROM payout_vault WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payout account linked.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Safe for API responses: never returns ciphertext, iv, or auth tag
CREATE OR REPLACE FUNCTION get_payout_public(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'payout_status',  get_payout_state(p_user_id),
    'channel',        (SELECT channel FROM payout_vault WHERE user_id = p_user_id),
    'bank_name',      (SELECT bank_name FROM payout_vault WHERE user_id = p_user_id),
    'masked_display', (SELECT masked_display FROM payout_vault WHERE user_id = p_user_id),
    'verified_at',    (SELECT verified_at FROM payout_vault WHERE user_id = p_user_id),
    'relinked_at',    (SELECT relinked_at FROM payout_vault WHERE user_id = p_user_id)
  );
END;
$$ LANGUAGE plpgsql STABLE;


-- Backend-only: encrypted row for payout decryption. Never expose through an API route.
CREATE OR REPLACE FUNCTION get_payout_ciphertext(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT row_to_json(v)
    FROM (
      SELECT ciphertext, iv, auth_tag, key_version, channel, bank_name
      FROM payout_vault
      WHERE user_id = p_user_id
      AND verified_at IS NOT NULL
    ) v
  );
END;
$$ LANGUAGE plpgsql STABLE;


-- Lock sensitive vault functions to the DB owner role (backend). No PostgREST/anon access.
DO $$
DECLARE
  r   RECORD;
  rol TEXT;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND p.proname IN (
      'save_payout_destination', 'mark_payout_verified', 'remove_payout',
      'get_payout_public', 'get_payout_ciphertext'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC', r.kind, r.sig);
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
        EXECUTE format('REVOKE ALL ON %s %s FROM %I', r.kind, r.sig, rol);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE payout_vault FROM %I', rol);
    END IF;
  END LOOP;
END;
$$;



/* ─────────────────────────────────────────────────────────────
   CARDS
   User adds cards, toggles sharing, then circle members can see them
   ───────────────────────────────────────────────────────────── */

CREATE OR REPLACE PROCEDURE add_card(
  p_user_id   VARCHAR(36),
  p_bank_name VARCHAR(100),
  p_card_type VARCHAR(50),
  p_card_tier VARCHAR(50)
) AS $$
BEGIN
  INSERT INTO cards (id, user_id, bank_name, card_type, card_tier, created_at)
  VALUES (uuid_generate_v4()::varchar, p_user_id, p_bank_name, p_card_type, p_card_tier, extract(epoch from now()) * 1000);
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_cards(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(c), '[]'::json)
    FROM (
      SELECT
        cards.id,
        cards.bank_name,
        cards.card_type,
        cards.card_tier,
        cards.allow_sharing,
        cards.created_at,
        get_payout_state(cards.user_id) AS payout_status
      FROM cards
      WHERE cards.user_id = p_user_id
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Toggles allow_sharing between 0 and 1
CREATE OR REPLACE PROCEDURE toggle_card_sharing(
  p_user_id VARCHAR(36),
  p_card_id VARCHAR(36)
) AS $$
BEGIN
  UPDATE cards
  SET allow_sharing = CASE WHEN allow_sharing = 1 THEN 0 ELSE 1 END
  WHERE id = p_card_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found or access denied.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Blocked if an active request is using this card
CREATE OR REPLACE PROCEDURE delete_card(
  p_user_id VARCHAR(36),
  p_card_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM requests
    WHERE card_id = p_card_id
    AND rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
  ) THEN
    RAISE EXCEPTION 'Cannot delete card. There is an active request using this card.';
  END IF;

  DELETE FROM cards
  WHERE id = p_card_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card not found or access denied.';
  END IF;
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   CIRCLE
   Flow: find_user_by_phone → add_to_circle → respond_to_circle_invite
         → get_circle / get_circle_cards (used before creating a request)
   ───────────────────────────────────────────────────────────── */

-- Send a circle invite
-- Blocked if a pending or accepted relationship already exists
-- Declined invites can be re-sent (old row is deleted before re-inserting)
CREATE OR REPLACE PROCEDURE add_to_circle(
  p_user_id   VARCHAR(36),
  p_friend_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM circle
    WHERE (
      (user_id = p_user_id AND friend_id = p_friend_id)
      OR (user_id = p_friend_id AND friend_id = p_user_id)
    )
    AND c_status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'Already in circle or invite pending.';
  END IF;

  DELETE FROM circle
  WHERE (user_id = p_user_id AND friend_id = p_friend_id)
  OR (user_id = p_friend_id AND friend_id = p_user_id);

  INSERT INTO circle (user_id, friend_id, c_status, created_at)
  VALUES (p_user_id, p_friend_id, 'pending', extract(epoch from now()) * 1000);
END;
$$ LANGUAGE plpgsql;


-- Recipient accepts or declines the invite
CREATE OR REPLACE PROCEDURE respond_to_circle_invite(
  p_user_id   VARCHAR(36),
  p_friend_id VARCHAR(36),
  p_status    VARCHAR(20)
) AS $$
BEGIN
  IF p_status NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid status. Must be accepted or declined.';
  END IF;

  UPDATE circle
  SET c_status = p_status
  WHERE user_id = p_friend_id AND friend_id = p_user_id
  AND c_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invite found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Blocked if there is any active or disputed request between the two users
CREATE OR REPLACE PROCEDURE remove_from_circle(
  p_user_id   VARCHAR(36),
  p_friend_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM requests
    WHERE rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
    AND (
      (requester_id = p_user_id AND card_holder_id = p_friend_id)
      OR (requester_id = p_friend_id AND card_holder_id = p_user_id)
    )
  ) THEN
    RAISE EXCEPTION 'Cannot remove. There is an active order with this user.';
  END IF;

  DELETE FROM circle
  WHERE (user_id = p_user_id AND friend_id = p_friend_id)
  OR (user_id = p_friend_id AND friend_id = p_user_id);
END;
$$ LANGUAGE plpgsql;


-- is_sender = true → logged-in user sent the invite (show Cancel button)
-- is_sender = false → logged-in user received the invite (show Accept/Decline)
CREATE OR REPLACE FUNCTION get_circle(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(c), '[]'::json)
    FROM (
      SELECT u.id, u.display_name, u.phone, ci.c_status, TRUE AS is_sender
      FROM circle ci
      JOIN users u ON u.id = ci.friend_id
      WHERE ci.user_id = p_user_id
      UNION
      SELECT u.id, u.display_name, u.phone, ci.c_status, FALSE AS is_sender
      FROM circle ci
      JOIN users u ON u.id = ci.user_id
      WHERE ci.friend_id = p_user_id
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Returns only cards with allow_sharing = 1 AND holder payout verified
-- Called by Sara when selecting which card to use for a request
CREATE OR REPLACE FUNCTION get_circle_cards(
  p_user_id   VARCHAR(36),
  p_friend_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle
    WHERE ((user_id = p_user_id AND friend_id = p_friend_id)
    OR (user_id = p_friend_id AND friend_id = p_user_id))
    AND c_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'This user is not in your circle.';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(c), '[]'::json)
    FROM (
      SELECT cards.id, cards.bank_name, cards.card_type, cards.card_tier
      FROM cards
      WHERE cards.user_id = p_friend_id
      AND cards.allow_sharing = 1
      AND get_payout_state(cards.user_id) = 'verified'
    ) c
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   CHAT
   Available on any request that is not expired, declined, or cancelled
   ───────────────────────────────────────────────────────────── */

CREATE OR REPLACE PROCEDURE send_message(
  p_request_id        VARCHAR(36),
  p_sender_id         VARCHAR(36),
  p_message           TEXT,
  p_attachment_path   VARCHAR(200)
) AS $$
DECLARE
  v_message TEXT;
  v_attachment TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_request_id
    AND (requester_id = p_sender_id OR card_holder_id = p_sender_id)
    AND rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
  ) THEN
    RAISE EXCEPTION 'Request not found or chat not available.';
  END IF;

  v_message := NULLIF(TRIM(p_message), '');
  v_attachment := NULLIF(TRIM(p_attachment_path), '');

  IF v_message IS NULL AND v_attachment IS NULL THEN
    RAISE EXCEPTION 'Message or attachment is required.';
  END IF;

  INSERT INTO chat_messages (
    id, request_id, sender_id, chat_message, attachment_path, created_at
  )
  VALUES (
    uuid_generate_v4()::varchar,
    p_request_id,
    p_sender_id,
    v_message,
    v_attachment,
    extract(epoch from now()) * 1000
  );
END;
$$ LANGUAGE plpgsql;


-- Returns messages in chronological order
-- Verifies user is a party to the request before returning anything
CREATE OR REPLACE FUNCTION get_messages(
  p_request_id VARCHAR(36),
  p_user_id    VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_request_id
    AND (requester_id = p_user_id OR card_holder_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(m), '[]'::json)
    FROM (
      SELECT cm.id, cm.sender_id, u.display_name AS sender_name,
             cm.chat_message, cm.attachment_path, cm.created_at
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.request_id = p_request_id
      ORDER BY cm.created_at ASC
    ) m
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   SCHEDULED JOBS (auth housekeeping only — no order timers)
   purge_expired_refresh_tokens optional; not wired in backend yet
   ───────────────────────────────────────────────────────────── */

-- Housekeeping — expired refresh token rows (optional; not wired in backend yet)
CREATE OR REPLACE PROCEDURE purge_expired_refresh_tokens() AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < (extract(epoch from now()) * 1000);
END;
$$ LANGUAGE plpgsql;


