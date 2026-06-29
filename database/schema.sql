-- database/schema.sql
--
-- Money convention: all amounts are whole PKR (Pakistani Rupees), stored as INT.
-- e.g. wallet_balance = 5000 means Rs 5,000. No paisa / fractional rupees in MVP.

/* ── EXTENSIONS ────────────────────────────────────────────── */
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/* ── USERS ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS users (
  id                   VARCHAR(36) PRIMARY KEY,
  phone                VARCHAR(20) UNIQUE NOT NULL,
  display_name         VARCHAR(100),
  pin_hash             TEXT,
  wallet_balance       INT NOT NULL DEFAULT 0,
  security_question    TEXT,
  security_answer_hash TEXT,
  device_id            VARCHAR(200),
  is_onboarded         INT NOT NULL DEFAULT 0,
  created_at           BIGINT NOT NULL
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

ALTER TABLE otps ADD COLUMN IF NOT EXISTS resend_count INT NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT;

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

/* ── PIN PHONE LOCKOUT ──────────────────────────────────────── */
-- Phone-wide PIN ban after 4 failed verifies in a round (separate from OTP lockout).
-- fail_round escalation: 1 day → 2 → 4 → 10 → permanently blocked (contact support).
CREATE TABLE IF NOT EXISTS pin_phone_lockout (
  phone               VARCHAR(20) PRIMARY KEY,
  pin_fail_count      INT NOT NULL DEFAULT 0,
  fail_round          INT NOT NULL DEFAULT 0,
  blocked_until       BIGINT,
  permanently_blocked INT NOT NULL DEFAULT 0
);

/* ── PIN RESET GRANTS ───────────────────────────────────────── */
-- After correct security answer: phone may reset PIN once before expires_at (15 min).
CREATE TABLE IF NOT EXISTS pin_reset_grants (
  phone      VARCHAR(20) PRIMARY KEY,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

/* ── SECURITY ANSWER LOCKOUT ────────────────────────────────── */
-- 3 wrong security answers → permanently blocked (contact support). No ban ladder.
CREATE TABLE IF NOT EXISTS security_answer_lockout (
  phone               VARCHAR(20) PRIMARY KEY,
  fail_count          INT NOT NULL DEFAULT 0,
  permanently_blocked INT NOT NULL DEFAULT 0
);


/* ── REFRESH TOKENS ─────────────────────────────────────────── */
-- Opaque refresh tokens (SHA-256 hash stored — plain token never persisted)
-- One active refresh per user (one-device policy); rotated on each /auth/refresh
-- Revoked via revoke_refresh_tokens on logout or bind_device (new phone OTP)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  device_id   VARCHAR(200) NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  BIGINT NOT NULL,
  created_at  BIGINT NOT NULL
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
-- Live state of an order — row exists until a terminal transaction is created
-- Columns marked "set at accept_request" are NULL until Ahmed accepts
-- Financial columns on requests:
--   order amount         —  Sara locks this at confirm_payment
--   platform_fee       — set at submit_tracking (5% of actual_saving)
--   incentive_fee      — set at submit_tracking (25% of actual_saving)
--   actual_amount_paid — set at submit_tracking (Ahmed's checkout total)
-- 'completed' and 'disputed' are not in rq_status — those states immediately
-- create a transaction row and delete this request row
CREATE TABLE IF NOT EXISTS requests (
  id                   VARCHAR(36) PRIMARY KEY,
  requester_id         VARCHAR(36) NOT NULL REFERENCES users(id),
  card_holder_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  card_id              VARCHAR(36) NOT NULL REFERENCES cards(id),
  merchant             VARCHAR(100) NOT NULL,
  product_url          TEXT,
  delivery_address     TEXT NOT NULL,
  order_amount         INT NOT NULL CHECK (order_amount > 0),
  discount_percentage  INT NOT NULL DEFAULT 0,
  note                 TEXT,

  -- set at submit_tracking
  platform_fee         INT,
  incentive_fee        INT,
  screenshot_url       VARCHAR(200),
  actual_amount_paid   INT,
  dispute_deadline     BIGINT,  -- set at submit_tracking: Sara confirm/dispute window ends here (30 min)
  rq_status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')),
  expires_at           BIGINT NOT NULL,  -- repurposed per phase: pending / payment_pending / escrow_locked deadlines
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);

/* ── TRANSACTIONS ───────────────────────────────────────────── */
-- Sealed final record — created once, never updated
-- Self-contained snapshot — no FK back to requests (request row is deleted at this point)
-- txn_status values:
--   completed → order fulfilled, Ahmed paid, Sara refunded the difference
--   cancelled → Ahmed cancelled after accepting (from escrow_locked), Sara refunded in full
--   refunded  → Ahmed went silent for 30 mins, auto job refunded Sara in full
--   disputed  → Sara rejected within 15 min window, Sara refunded in full
CREATE TABLE IF NOT EXISTS transactions (
  id                   VARCHAR(36) PRIMARY KEY,
  requester_id         VARCHAR(36) NOT NULL REFERENCES users(id),
  card_holder_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  merchant             VARCHAR(100) NOT NULL,
  product_url          TEXT,
  delivery_address     TEXT NOT NULL,
  order_amount         INT NOT NULL,
  discount_percentage  INT NOT NULL DEFAULT 0,
  note                 TEXT,
  bank_name            VARCHAR(100) NOT NULL,
  card_type            VARCHAR(50) NOT NULL,
  card_tier            VARCHAR(50) NOT NULL,
  platform_fee         INT NOT NULL DEFAULT 0,
  incentive_fee        INT NOT NULL DEFAULT 0,
  actual_amount_paid   INT,
  txn_status           VARCHAR(20) NOT NULL CHECK (txn_status IN ('completed', 'cancelled', 'refunded', 'disputed')),
  screenshot_url          VARCHAR(200),
  dispute_reason       TEXT,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);

/* ── PLATFORM ACCOUNT ───────────────────────────────────────── */
-- Single-row table that holds the platform's collected fees
-- id is always 1 — there is only ever one row
CREATE TABLE IF NOT EXISTS platform_account (
  id             INT PRIMARY KEY DEFAULT 1,
  wallet_balance INT NOT NULL DEFAULT 0
);

-- Seed the single platform account row on first run
INSERT INTO platform_account (id, wallet_balance)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

/* ── CHAT ───────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS chat_messages (
  id           VARCHAR(36) PRIMARY KEY,
  request_id   VARCHAR(36) NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id    VARCHAR(36) NOT NULL REFERENCES users(id),
  chat_message TEXT NOT NULL,
  created_at   BIGINT NOT NULL
);


/* ── INDEXES for performance ────────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_otps_phone          ON otps(phone);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_exp  ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_cards_user          ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_user         ON circle(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_friend       ON circle(friend_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester  ON requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_holder     ON requests(card_holder_id);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(rq_status);
CREATE INDEX IF NOT EXISTS idx_requests_status_expires
  ON requests (rq_status, expires_at);
CREATE INDEX IF NOT EXISTS idx_requests_dispute_deadline
  ON requests (dispute_deadline)
  WHERE rq_status = 'tracking_submitted';
CREATE INDEX IF NOT EXISTS idx_txn_requester       ON transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_txn_holder          ON transactions(card_holder_id);
CREATE INDEX IF NOT EXISTS idx_chat_request        ON chat_messages(request_id);


/* ─────────────────────────────────────────────────────────────
   AUTH
   Flow: store_otp → verify_otp (login + bind_device, revokes old refresh)
         OTP limits: 60s cooldown, 1 resend, 3 tries/code, 6 fails/round → otp_phone_lockout
         Success clears otp_phone_lockout row for that phone
         → get_login_status → PIN screen → verify_pin (bcrypt in Node + pin_phone_lockout)
         PIN limits: 4 fails/round → pin_phone_lockout; success deletes that row
         Forgot PIN (known device): security Q → pin_reset_grants → new PIN
         Security answer: 3 fails → security_answer_lockout permanent
         → backend issues access JWT (~15 min) + store_refresh_token (~30 days)
         → validate_refresh_token / rotate_refresh_token on /auth/refresh
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
      SELECT id, phone, display_name, wallet_balance, is_onboarded
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


-- Deletes the refresh token for a user — bind_device (new phone OTP)
CREATE OR REPLACE PROCEDURE revoke_refresh_tokens(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  DELETE FROM refresh_tokens WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- Explicit logout: revoke refresh + unbind device (next /auth/status → new_device)
CREATE OR REPLACE PROCEDURE logout_user(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  CALL revoke_refresh_tokens(p_user_id);

  UPDATE users
  SET device_id = NULL
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Legacy — drop if upgrading: DROP PROCEDURE IF EXISTS revoke_refresh_token(TEXT);


-- Called by backend after OTP/PIN login — replaces any existing row for this user
CREATE OR REPLACE FUNCTION store_refresh_token(
  p_user_id    VARCHAR(36),
  p_device_id  VARCHAR(200),
  p_token_hash TEXT,
  p_expires_at BIGINT
) RETURNS JSON AS $$
DECLARE
  v_id VARCHAR(36);
BEGIN
  IF p_token_hash IS NULL OR p_token_hash = '' THEN
    RAISE EXCEPTION 'Token hash cannot be empty.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_user_id AND device_id = p_device_id
  ) THEN
    RAISE EXCEPTION 'Device does not match the bound device for this user.';
  END IF;

  DELETE FROM refresh_tokens WHERE user_id = p_user_id;

  v_id := uuid_generate_v4()::varchar;

  INSERT INTO refresh_tokens (id, user_id, device_id, token_hash, expires_at, created_at)
  VALUES (
    v_id, p_user_id, p_device_id, p_token_hash, p_expires_at,
    extract(epoch from now()) * 1000
  );

  RETURN json_build_object(
    'id',         v_id,
    'expires_at', p_expires_at
  );
END;
$$ LANGUAGE plpgsql;


-- Validates refresh token + device; returns user fields for new access JWT
CREATE OR REPLACE FUNCTION validate_refresh_token(
  p_token_hash TEXT,
  p_device_id  VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT rt.user_id, rt.device_id, rt.expires_at,
         u.phone, u.display_name, u.wallet_balance, u.is_onboarded
  INTO v_row
  FROM refresh_tokens rt
  JOIN users u ON u.id = rt.user_id
  WHERE rt.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid refresh token.';
  END IF;

  IF (extract(epoch from now()) * 1000) > v_row.expires_at THEN
    DELETE FROM refresh_tokens WHERE token_hash = p_token_hash;
    RAISE EXCEPTION 'Refresh token has expired.';
  END IF;

  IF v_row.device_id != p_device_id THEN
    RAISE EXCEPTION 'Device does not match refresh token.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_row.user_id AND device_id = p_device_id
  ) THEN
    DELETE FROM refresh_tokens WHERE user_id = v_row.user_id;
    RAISE EXCEPTION 'Session revoked. Please log in again.';
  END IF;

  RETURN json_build_object(
    'user_id',        v_row.user_id,
    'device_id',      v_row.device_id,
    'phone',          v_row.phone,
    'display_name',   v_row.display_name,
    'wallet_balance', v_row.wallet_balance,
    'is_onboarded',   v_row.is_onboarded
  );
END;
$$ LANGUAGE plpgsql;


-- Rotation: validate old token, replace with new (store_refresh_token clears prior row for user)
CREATE OR REPLACE FUNCTION rotate_refresh_token(
  p_old_token_hash TEXT,
  p_new_token_hash TEXT,
  p_device_id      VARCHAR(200),
  p_expires_at     BIGINT
) RETURNS JSON AS $$
DECLARE
  v_valid JSON;
  v_store JSON;
BEGIN
  v_valid := validate_refresh_token(p_old_token_hash, p_device_id);

  v_store := store_refresh_token(
    v_valid->>'user_id', p_device_id, p_new_token_hash, p_expires_at
  );

  RETURN json_build_object(
    'expires_at',     v_store->'expires_at',
    'user_id',        v_valid->'user_id',
    'phone',          v_valid->'phone',
    'display_name',   v_valid->'display_name',
    'wallet_balance', v_valid->'wallet_balance',
    'is_onboarded',   v_valid->'is_onboarded',
    'device_id',      v_valid->'device_id'
  );
END;
$$ LANGUAGE plpgsql;


-- Binds this physical device to the user — called inside verify_otp
-- Does not set is_onboarded — that happens at complete_onboarding
-- Returns previous device_id (NULL for brand new users) for optional FCM kick
CREATE OR REPLACE FUNCTION bind_device(
  p_user_id   VARCHAR(36),
  p_device_id VARCHAR(200)
) RETURNS VARCHAR AS $$
DECLARE
  v_old_device_id VARCHAR(200);
BEGIN
  IF p_device_id IS NULL OR p_device_id = '' THEN
    RAISE EXCEPTION 'Device ID cannot be empty.';
  END IF;

  SELECT device_id INTO v_old_device_id
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  UPDATE users
  SET device_id = p_device_id
  WHERE id = p_user_id;

  -- Old phone refresh tokens must not renew access after a new device OTP login
  CALL revoke_refresh_tokens(p_user_id);

  RETURN v_old_device_id;
END;
$$ LANGUAGE plpgsql;


-- User submits OTP — checks expiry, attempt limit, then hash
-- On success: creates user if new, binds device_id, returns user + old_device_id
-- is_onboarded = 0 → backend issues session tokens; app routes to profile → pin → complete_onboarding
-- is_onboarded = 1 → backend returns requires_pin (no session); app shows PIN entry → pin/verify
CREATE OR REPLACE FUNCTION verify_otp(
  p_phone     VARCHAR(20),
  p_otp_hash  TEXT,
  p_device_id VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_otp           RECORD;
  v_user          JSON;
  v_user_id       VARCHAR(36);
  v_old_device_id VARCHAR(200);
  v_lock          RECORD;
  v_now           BIGINT;
  v_fail_count    INT;
  v_round         INT;
  v_days          INT;
  v_until         BIGINT;
BEGIN
  IF p_device_id IS NULL OR p_device_id = '' THEN
    RAISE EXCEPTION 'Device ID cannot be empty.';
  END IF;

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
  v_old_device_id := bind_device(v_user_id, p_device_id);

  RETURN (
    SELECT json_build_object(
      'id',             id,
      'phone',          phone,
      'display_name',   display_name,
      'wallet_balance', wallet_balance,
      'is_onboarded',   is_onboarded,
      'old_device_id',  v_old_device_id
    )
    FROM users WHERE id = v_user_id
  );
END;
$$ LANGUAGE plpgsql;


-- Called silently by the app on startup using phone + UUID from secure storage
-- Decides which screen to show without the user doing anything
--   new_user     → phone not in DB → show phone screen → OTP → onboarding
--   new_device   → phone exists, device unknown → show phone screen → OTP (binds device)
--   known_device → phone and device match → go straight to PIN screen
CREATE OR REPLACE FUNCTION get_login_status(
  p_phone     VARCHAR(20),
  p_device_id VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM users WHERE phone = p_phone;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'new_user');
  END IF;

  -- NULL safe: if either side is NULL this condition is false, falls through to new_device
  IF v_user.device_id IS NOT NULL AND v_user.device_id = p_device_id THEN
    RETURN json_build_object(
      'status',            'known_device',
      'user_id',           v_user.id,
      'has_pin',           (v_user.pin_hash IS NOT NULL),
      'is_onboarded',      v_user.is_onboarded,
      'has_valid_refresh', EXISTS (
        SELECT 1 FROM refresh_tokens
        WHERE user_id = v_user.id
        AND device_id = p_device_id
        AND expires_at > (extract(epoch from now()) * 1000)
      )
    );
  END IF;

  -- Security question check removed — NOT IN MVP
  RETURN json_build_object(
    'status', 'new_device'
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   ONBOARDING
   Device is bound at verify_otp. Brand new users then:
   update_profile → upsert_pin → upsert_security_question → complete_onboarding
   ───────────────────────────────────────────────────────────── */

-- Step 1 — user sets their display name
CREATE OR REPLACE PROCEDURE update_profile(
  p_user_id      VARCHAR(36),
  p_display_name VARCHAR(100)
) AS $$
BEGIN
  UPDATE users
  SET display_name = p_display_name
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Step 2 — user sets PIN (also used in forgot PIN reset flow)
CREATE OR REPLACE PROCEDURE upsert_pin(
  p_user_id  VARCHAR(36),
  p_pin_hash TEXT
) AS $$
BEGIN
  UPDATE users
  SET pin_hash = p_pin_hash
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Step 3 — user sets security question + answer hash (answer hashed in Node with bcrypt)
CREATE OR REPLACE PROCEDURE upsert_security_question(
  p_user_id      VARCHAR(36),
  p_question     TEXT,
  p_answer_hash  TEXT
) AS $$
BEGIN
  IF p_question IS NULL OR TRIM(p_question) = '' THEN
    RAISE EXCEPTION 'Security question is required.';
  END IF;

  IF p_answer_hash IS NULL OR p_answer_hash = '' THEN
    RAISE EXCEPTION 'Security answer hash is required.';
  END IF;

  UPDATE users
  SET security_question    = TRIM(p_question),
      security_answer_hash = p_answer_hash
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Step 4 — final onboarding step (device already bound at OTP verify)
CREATE OR REPLACE FUNCTION complete_onboarding(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND pin_hash IS NOT NULL
    AND display_name IS NOT NULL
    AND TRIM(display_name) != ''
    AND security_question IS NOT NULL
    AND TRIM(security_question) != ''
    AND security_answer_hash IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Profile, PIN, and security question must be set before completing onboarding.';
  END IF;

  UPDATE users
  SET is_onboarded = 1
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN json_build_object(
    'user_id',      p_user_id,
    'is_onboarded', 1
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   RETURNING USER LOGIN
   get_login_status returns known_device → PIN screen → verify_pin (backend + lockout procs)
   ───────────────────────────────────────────────────────────── */

-- Reject PIN verify when this phone is temp- or permanently blocked
CREATE OR REPLACE PROCEDURE assert_pin_phone_allowed(
  p_phone VARCHAR(20)
) AS $$
DECLARE
  v_now  BIGINT;
  v_lock RECORD;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  SELECT * INTO v_lock FROM pin_phone_lockout WHERE phone = p_phone;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_lock.permanently_blocked = 1 THEN
    RAISE EXCEPTION 'OTP_CONTACT_SUPPORT';
  END IF;

  IF v_lock.blocked_until IS NOT NULL AND v_lock.blocked_until > v_now THEN
    RAISE EXCEPTION 'OTP_LOCKED:%', v_lock.blocked_until;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Called by backend after a wrong PIN (bcrypt compare in Node)
CREATE OR REPLACE PROCEDURE record_pin_fail(
  p_phone VARCHAR(20)
) AS $$
DECLARE
  v_now        BIGINT;
  v_fail_count INT;
  v_round      INT;
  v_days       INT;
  v_until      BIGINT;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  INSERT INTO pin_phone_lockout (phone, pin_fail_count, fail_round, permanently_blocked)
  VALUES (p_phone, 0, 0, 0)
  ON CONFLICT (phone) DO NOTHING;

  UPDATE pin_phone_lockout
  SET pin_fail_count = pin_fail_count + 1
  WHERE phone = p_phone
  RETURNING pin_fail_count, fail_round INTO v_fail_count, v_round;

  IF v_fail_count >= 4 THEN
    v_round := v_round + 1;

    IF v_round >= 5 THEN
      UPDATE pin_phone_lockout
      SET fail_round          = v_round,
          pin_fail_count      = 0,
          blocked_until       = NULL,
          permanently_blocked = 1
      WHERE phone = p_phone;

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

    UPDATE pin_phone_lockout
    SET fail_round          = v_round,
        pin_fail_count      = 0,
        blocked_until       = v_until,
        permanently_blocked = 0
    WHERE phone = p_phone;

    RAISE EXCEPTION 'OTP_LOCKED:%', v_until;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Called by backend after successful PIN verify — lockout no longer applies
CREATE OR REPLACE PROCEDURE clear_pin_phone_lockout(
  p_phone VARCHAR(20)
) AS $$
BEGIN
  DELETE FROM pin_phone_lockout WHERE phone = p_phone;
END;
$$ LANGUAGE plpgsql;


-- Legacy DB PIN compare (plain hash) — not used by backend; bcrypt.compare in auth.controller.js
-- Lockout: assert_pin_phone_allowed → record_pin_fail / clear_pin_phone_lockout
CREATE OR REPLACE FUNCTION verify_pin(
  p_phone     VARCHAR(20),
  p_pin_hash  TEXT,
  p_device_id VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM users WHERE phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_user.pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set. Please complete registration.';
  END IF;

  IF v_user.device_id IS NULL OR v_user.device_id != p_device_id THEN
    RAISE EXCEPTION 'Unrecognised device. Please verify your phone number.';
  END IF;

  IF v_user.pin_hash != p_pin_hash THEN
    RAISE EXCEPTION 'Invalid PIN.';
  END IF;

  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, phone, display_name, wallet_balance, is_onboarded
      FROM users WHERE id = v_user.id
    ) u
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   FORGOT PIN (known device only)
   get_forgot_pin_question → verify answer in Node (bcrypt)
   → create_pin_reset_grant → complete_forgot_pin_reset
   New device recovery → OTP only (unchanged).
   ───────────────────────────────────────────────────────────── */

-- Reject if security answer attempts exhausted (3 fails → permanent)
CREATE OR REPLACE PROCEDURE assert_security_answer_allowed(
  p_phone VARCHAR(20)
) AS $$
DECLARE
  v_lock RECORD;
BEGIN
  SELECT * INTO v_lock FROM security_answer_lockout WHERE phone = p_phone;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_lock.permanently_blocked = 1 THEN
    RAISE EXCEPTION 'OTP_CONTACT_SUPPORT';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Wrong security answer — 3rd fail permanently blocks (contact support)
CREATE OR REPLACE PROCEDURE record_security_answer_fail(
  p_phone VARCHAR(20)
) AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO security_answer_lockout (phone, fail_count, permanently_blocked)
  VALUES (p_phone, 0, 0)
  ON CONFLICT (phone) DO NOTHING;

  UPDATE security_answer_lockout
  SET fail_count = fail_count + 1
  WHERE phone = p_phone
  RETURNING fail_count INTO v_count;

  IF v_count >= 3 THEN
    UPDATE security_answer_lockout
    SET permanently_blocked = 1
    WHERE phone = p_phone;

    RAISE EXCEPTION 'OTP_CONTACT_SUPPORT';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- After correct answer — 15 minute window to set a new PIN (overwrites prior grant)
CREATE OR REPLACE PROCEDURE create_pin_reset_grant(
  p_phone VARCHAR(20)
) AS $$
DECLARE
  v_now BIGINT;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  DELETE FROM security_answer_lockout WHERE phone = p_phone;

  INSERT INTO pin_reset_grants (phone, expires_at, created_at)
  VALUES (p_phone, v_now + 900000, v_now)
  ON CONFLICT (phone) DO UPDATE
  SET expires_at = EXCLUDED.expires_at,
      created_at = EXCLUDED.created_at;
END;
$$ LANGUAGE plpgsql;


-- Step 1 of forgot PIN — returns question text for known device
CREATE OR REPLACE FUNCTION get_forgot_pin_question(
  p_phone     VARCHAR(20),
  p_device_id VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_user RECORD;
BEGIN
  CALL assert_security_answer_allowed(p_phone);

  SELECT * INTO v_user FROM users WHERE phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_user.pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not set. Please complete registration.';
  END IF;

  IF v_user.device_id IS NULL OR v_user.device_id != p_device_id THEN
    RAISE EXCEPTION 'Unrecognised device. Please verify your phone number.';
  END IF;

  IF v_user.security_question IS NULL OR TRIM(v_user.security_question) = ''
     OR v_user.security_answer_hash IS NULL THEN
    RAISE EXCEPTION 'Security question not set.';
  END IF;

  RETURN json_build_object('security_question', v_user.security_question);
END;
$$ LANGUAGE plpgsql;


-- Step 3 of forgot PIN — valid grant + device match → new PIN, cleanup, revoke refresh
CREATE OR REPLACE PROCEDURE complete_forgot_pin_reset(
  p_phone      VARCHAR(20),
  p_device_id  VARCHAR(200),
  p_pin_hash   TEXT
) AS $$
DECLARE
  v_now  BIGINT;
  v_user RECORD;
  v_grant RECORD;
BEGIN
  v_now := extract(epoch from now()) * 1000;

  SELECT * INTO v_user FROM users WHERE phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_user.device_id IS NULL OR v_user.device_id != p_device_id THEN
    RAISE EXCEPTION 'Unrecognised device. Please verify your phone number.';
  END IF;

  SELECT * INTO v_grant FROM pin_reset_grants WHERE phone = p_phone;

  IF NOT FOUND OR v_now >= v_grant.expires_at THEN
    RAISE EXCEPTION 'PIN reset window expired. Please verify your security answer again.';
  END IF;

  UPDATE users SET pin_hash = p_pin_hash WHERE id = v_user.id;

  DELETE FROM pin_reset_grants WHERE phone = p_phone;
  DELETE FROM pin_phone_lockout WHERE phone = p_phone;

  CALL revoke_refresh_tokens(v_user.id);
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   PROFILE
   ───────────────────────────────────────────────────────────── */

-- Returns user's own profile including wallet balance
CREATE OR REPLACE FUNCTION get_profile(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, phone, display_name, wallet_balance
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
   WALLET
   top_up_wallet must be called before create_request is possible
   ───────────────────────────────────────────────────────────── */

-- Called by backend ONLY after payment gateway confirms the real-world transaction
CREATE OR REPLACE PROCEDURE top_up_wallet(
  p_user_id VARCHAR(36),
  p_amount  INT
) AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be greater than zero.';
  END IF;

  UPDATE users
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Deducts from wallet first — backend then initiates the real bank transfer
-- If the bank transfer fails, backend is responsible for calling top_up_wallet to refund
CREATE OR REPLACE FUNCTION withdraw_from_wallet(
  p_user_id VARCHAR(36),
  p_amount  INT
) RETURNS JSON AS $$
DECLARE
  v_new_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero.';
  END IF;

  IF (SELECT wallet_balance FROM users WHERE id = p_user_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance.';
  END IF;

  UPDATE users
  SET wallet_balance = wallet_balance - p_amount
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN json_build_object(
    'user_id',          p_user_id,
    'amount_withdrawn', p_amount,
    'new_balance',      v_new_balance
  );
END;
$$ LANGUAGE plpgsql;


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
      SELECT id, bank_name, card_type, card_tier, allow_sharing, created_at
      FROM cards
      WHERE user_id = p_user_id
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


-- Returns only cards with allow_sharing = 1
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
      SELECT id, bank_name, card_type, card_tier
      FROM cards
      WHERE user_id = p_friend_id
      AND allow_sharing = 1
    ) c
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   CHAT
   Available on any request that is not expired, declined, or cancelled
   ───────────────────────────────────────────────────────────── */

CREATE OR REPLACE PROCEDURE send_message(
  p_request_id VARCHAR(36),
  p_sender_id  VARCHAR(36),
  p_message    TEXT
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_request_id
    AND (requester_id = p_sender_id OR card_holder_id = p_sender_id)
    AND rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')
  ) THEN
    RAISE EXCEPTION 'Request not found or chat not available.';
  END IF;

  INSERT INTO chat_messages (id, request_id, sender_id, chat_message, created_at)
  VALUES (uuid_generate_v4()::varchar, p_request_id, p_sender_id, p_message, extract(epoch from now()) * 1000);
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
             cm.chat_message, cm.created_at
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.request_id = p_request_id
      ORDER BY cm.created_at ASC
    ) m
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   SCHEDULED JOBS
   Called by the backend on a regular interval (e.g. every minute)
   ───────────────────────────────────────────────────────────── */

-- Housekeeping — expired refresh token rows (optional cron alongside auto_expire_requests)
CREATE OR REPLACE PROCEDURE purge_expired_refresh_tokens() AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < (extract(epoch from now()) * 1000);
END;
$$ LANGUAGE plpgsql;


-- Deletes timed-out requests — no money involved, no transaction row created
-- FOR UPDATE per row — pending competes with accept/decline/cancel; payment_pending with confirm/cancel
CREATE OR REPLACE PROCEDURE auto_expire_requests() AS $$
DECLARE
  v_req RECORD;
BEGIN
  FOR v_req IN
    SELECT id FROM requests
    WHERE rq_status IN ('pending', 'payment_pending')
    AND expires_at < (extract(epoch from now()) * 1000)
    FOR UPDATE
  LOOP
    DELETE FROM requests WHERE id = v_req.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- Case 1: escrow_locked for 30 mins — Ahmed never submitted tracking — refund Sara full order_amount
-- Case 2: tracking_submitted past dispute_deadline — Sara did not confirm or dispute:
--           actual_saving = order_amount − actual_amount_paid (fees set at submit_tracking)
--           Ahmed receives  actual_amount_paid + incentive_fee (25% of actual_saving)
--           Platform takes  platform_fee (5% of actual_saving)
--           Sara gets back  order_amount − actual_amount_paid − incentive_fee − platform_fee (70% of actual_saving)
-- Both cases: INSERT sealed transaction record, DELETE request row
CREATE OR REPLACE PROCEDURE auto_release_escrow() AS $$
DECLARE
  v_req RECORD;
BEGIN
  -- Case 1: Refund Sara — Ahmed never submitted tracking within 30 mins
  -- FOR UPDATE OF r — only one of submit_tracking / cancel_request_holder / this loop can settle each row
  FOR v_req IN
    SELECT r.*, c.bank_name, c.card_type, c.card_tier
    FROM requests r
    JOIN cards c ON c.id = r.card_id
    WHERE r.rq_status = 'escrow_locked'
    AND r.order_amount IS NOT NULL
    AND (extract(epoch from now()) * 1000) > r.expires_at
    FOR UPDATE OF r
  LOOP
    UPDATE users
    SET wallet_balance = wallet_balance + v_req.order_amount
    WHERE id = v_req.requester_id;

    INSERT INTO transactions (
      id, requester_id, card_holder_id, merchant, product_url,
      delivery_address, order_amount, discount_percentage, note,
      bank_name, card_type, card_tier,
      platform_fee, incentive_fee, actual_amount_paid,
      txn_status, screenshot_url, dispute_reason,
      created_at, updated_at
    ) VALUES (
      uuid_generate_v4()::varchar, v_req.requester_id, v_req.card_holder_id,
      v_req.merchant, v_req.product_url, v_req.delivery_address,
      v_req.order_amount, v_req.discount_percentage, v_req.note,
      v_req.bank_name, v_req.card_type, v_req.card_tier,
      v_req.platform_fee, v_req.incentive_fee, NULL,
      'refunded', NULL, NULL,
      extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
    );

    DELETE FROM requests WHERE id = v_req.id;
  END LOOP;

  -- Case 2: Pay Ahmed — dispute_deadline passed, Sara did not confirm or dispute
  -- FOR UPDATE OF r — only one of confirm_tracking / raise_dispute / this loop can settle each row
  FOR v_req IN
    SELECT r.*, c.bank_name, c.card_type, c.card_tier
    FROM requests r
    JOIN cards c ON c.id = r.card_id
    WHERE r.rq_status = 'tracking_submitted'
    AND r.actual_amount_paid IS NOT NULL
    AND r.dispute_deadline IS NOT NULL
    AND (extract(epoch from now()) * 1000) > r.dispute_deadline
    FOR UPDATE OF r
  LOOP
    UPDATE users
    SET wallet_balance = wallet_balance + (v_req.actual_amount_paid + v_req.incentive_fee)
    WHERE id = v_req.card_holder_id;

    UPDATE platform_account
    SET wallet_balance = wallet_balance + v_req.platform_fee
    WHERE id = 1;

    UPDATE users
    SET wallet_balance = wallet_balance + (v_req.order_amount - v_req.actual_amount_paid - v_req.incentive_fee - v_req.platform_fee)
    WHERE id = v_req.requester_id;

    INSERT INTO transactions (
      id, requester_id, card_holder_id, merchant, product_url,
      delivery_address, order_amount, discount_percentage, note,
      bank_name, card_type, card_tier,
      platform_fee, incentive_fee, actual_amount_paid,
      txn_status, screenshot_url, dispute_reason,
      created_at, updated_at
    ) VALUES (
      uuid_generate_v4()::varchar, v_req.requester_id, v_req.card_holder_id,
      v_req.merchant, v_req.product_url, v_req.delivery_address,
      v_req.order_amount, v_req.discount_percentage, v_req.note,
      v_req.bank_name, v_req.card_type, v_req.card_tier,
      v_req.platform_fee, v_req.incentive_fee, v_req.actual_amount_paid,
      'completed', v_req.screenshot_url, NULL,
      extract(epoch from now()) * 1000, extract(epoch from now()) * 1000
    );

    DELETE FROM requests WHERE id = v_req.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
