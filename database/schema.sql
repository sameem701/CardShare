-- database/schema.sql
--
-- Money convention: all amounts are whole PKR (Pakistani Rupees), stored as INT.
-- User counters total_saved / total_earned are lifetime display stats only.
-- Real money moves via PSP — not stored as wallet_balance.

/* ── EXTENSIONS ────────────────────────────────────────────── */
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


/* ── USERS ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS users (
  id                   VARCHAR(36) PRIMARY KEY,
  phone                VARCHAR(20) UNIQUE NOT NULL,
  display_name         VARCHAR(100),
  pin_hash             TEXT,
  total_saved          INT NOT NULL DEFAULT 0,
  total_earned         INT NOT NULL DEFAULT 0,
  psp_payee_id         VARCHAR(200),
  payout_status        VARCHAR(20) NOT NULL DEFAULT 'none'
                         CHECK (payout_status IN ('none', 'pending', 'verified', 'failed')),
  payout_linked_at     BIGINT,      -- first/last successful PSP payout link
  payout_relinked_at   BIGINT,      -- set only on re-link; 24h accept cooldown from this
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


/* ── SESSIONS ────────────────────────────────────────────────── */
-- One active login session per user; id goes in access JWT as session_id
-- Lifetime tied to refresh (revoked together) — no expires_at column
CREATE TABLE IF NOT EXISTS sessions (
  id      VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);

/* ── REFRESH TOKENS ─────────────────────────────────────────── */
-- Opaque refresh tokens (SHA-256 hash stored — plain token never persisted)
-- One active refresh per user (one-device policy); rotated on each /auth/refresh
-- Revoked via revoke_refresh_tokens on logout or bind_device (new phone OTP); sessions cleared too
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
--   order amount         —  set at create_request
--   platform_fee       — set at submit_tracking (5% of actual_saving)
--   incentive_fee      — set at submit_tracking (15% of actual_saving)
--   actual_amount_paid — set at submit_tracking (Ahmed's checkout total)
--   psp_hold_id        — set at escrow_locked (PSP escrow reference)
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
  order_amount         INT NOT NULL CHECK (order_amount > 100),
  discount_percentage  INT NOT NULL DEFAULT 0,
  note                 TEXT,

  -- set at submit_tracking
  platform_fee         INT,
  incentive_fee        INT,
  screenshot_url       VARCHAR(200),
  actual_amount_paid   INT,
  rq_status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')),
  psp_hold_id          VARCHAR(200),
  psp_paid_at          BIGINT,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);

/* ── TRANSACTIONS ───────────────────────────────────────────── */
-- Sealed final record — created once, never updated
-- Self-contained snapshot — no FK back to requests (request row is deleted at this point)
-- txn_status values:
--   completed → order fulfilled, Ahmed paid, Sara refunded the difference
--   cancelled → Ahmed cancelled from escrow_locked, Sara refunded in full
--   disputed  → Sara rejected screenshot/amount, Sara refunded in full
--   refunded  → legacy rows only (old auto-refund cron); no longer written
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
  psp_hold_id          VARCHAR(200),
  psp_paid_at          BIGINT,
  psp_settled_at       BIGINT,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_exp  ON refresh_tokens(expires_at);
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
   Flow: store_otp → verify_otp (login + bind_device, revokes old refresh)
         OTP limits: 60s cooldown, 1 resend, 3 tries/code, 6 fails/round → otp_phone_lockout
         Success clears otp_phone_lockout row for that phone
         → get_login_status → PIN screen → verify_pin (bcrypt in Node + pin_phone_lockout)
         PIN limits: 4 fails/round → pin_phone_lockout; success deletes that row
         Forgot PIN (known device): security Q → pin_reset_grants → new PIN
         Security answer: 3 fails → security_answer_lockout permanent
         → backend issues access JWT (~5 min) + create_session + store_refresh_token (~30 days)
         → auth middleware: session row + X-Device-Id vs users.device_id
         → validate_refresh_token / rotate_refresh_token on /auth/refresh (same session_id)
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
      SELECT id, phone, display_name, total_saved, total_earned, payout_status, is_onboarded
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
CREATE OR REPLACE FUNCTION validate_session(
  p_session_id VARCHAR(36),
  p_user_id    VARCHAR(36),
  p_device_id  VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_session RECORD;
  v_user    RECORD;
BEGIN
  IF p_device_id IS NULL OR p_device_id = '' THEN
    RAISE EXCEPTION 'device_id is required.';
  END IF;

  SELECT * INTO v_session FROM sessions
  WHERE id = p_session_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session revoked. Please log in again.';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_user.device_id IS NULL OR v_user.device_id != p_device_id THEN
    RAISE EXCEPTION 'Unrecognised device. Please log in again.';
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


-- Explicit logout: revoke refresh + delete session(s); device binding kept (next open → PIN)
CREATE OR REPLACE PROCEDURE logout_user(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  CALL revoke_user_sessions(p_user_id);
  CALL revoke_refresh_tokens(p_user_id);
END;
$$ LANGUAGE plpgsql;


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
         u.phone, u.display_name, u.total_saved, u.total_earned, u.payout_status, u.is_onboarded
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

  IF NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = v_row.user_id) THEN
    DELETE FROM refresh_tokens WHERE user_id = v_row.user_id;
    RAISE EXCEPTION 'Session revoked. Please log in again.';
  END IF;

  RETURN json_build_object(
    'user_id',        v_row.user_id,
    'session_id',     (SELECT id FROM sessions WHERE user_id = v_row.user_id),
    'device_id',      v_row.device_id,
    'phone',          v_row.phone,
    'display_name',   v_row.display_name,
    'total_saved',    v_row.total_saved,
    'total_earned',   v_row.total_earned,
    'payout_status',  v_row.payout_status,
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
    'session_id',     v_valid->'session_id',
    'phone',          v_valid->'phone',
    'display_name',   v_valid->'display_name',
    'total_saved',    v_valid->'total_saved',
    'total_earned',   v_valid->'total_earned',
    'payout_status',  v_valid->'payout_status',
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

  CALL revoke_user_sessions(p_user_id);
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
      'total_saved',    total_saved,
      'total_earned',   total_earned,
      'payout_status',  payout_status,
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
      ),
      'has_active_session', EXISTS (
        SELECT 1 FROM sessions WHERE user_id = v_user.id
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
      SELECT id, phone, display_name, total_saved, total_earned, payout_status, is_onboarded
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

  CALL revoke_user_sessions(v_user.id);
  CALL revoke_refresh_tokens(v_user.id);
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   PROFILE
   ───────────────────────────────────────────────────────────── */

-- Returns user's own profile including saved/earned counters and payout status
CREATE OR REPLACE FUNCTION get_profile(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, phone, display_name, total_saved, total_earned, payout_status
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
   PSP — payout linking & escrow (called from backend webhooks)
   Real money at PSP; DB stores references + saved/earned counters only.
   ───────────────────────────────────────────────────────────── */

-- PSP webhook: holder completed payout onboarding
CREATE OR REPLACE PROCEDURE set_payout_verified(
  p_user_id      VARCHAR(36),
  p_psp_payee_id VARCHAR(200)
) AS $$
DECLARE
  v_had_linked BOOLEAN;
BEGIN
  IF p_psp_payee_id IS NULL OR TRIM(p_psp_payee_id) = '' THEN
    RAISE EXCEPTION 'PSP payee id is required.';
  END IF;

  SELECT payout_linked_at IS NOT NULL INTO v_had_linked
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  UPDATE users
  SET psp_payee_id       = p_psp_payee_id,
      payout_status      = 'verified',
      payout_linked_at   = extract(epoch from now()) * 1000,
      payout_relinked_at = CASE
        WHEN v_had_linked THEN extract(epoch from now()) * 1000
        ELSE NULL
      END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- PSP webhook: holder payout verification failed
CREATE OR REPLACE PROCEDURE set_payout_failed(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  UPDATE users
  SET payout_status = 'failed'
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- Before re-link: mark pending until new PSP webhook confirms
CREATE OR REPLACE PROCEDURE clear_payout(
  p_user_id VARCHAR(36)
) AS $$
BEGIN
  UPDATE users
  SET psp_payee_id  = NULL,
      payout_status = 'pending'
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;


-- PSP webhook: Sara paid — escrow locked (replaces fake-wallet confirm_payment)
CREATE OR REPLACE FUNCTION lock_escrow(
  p_request_id   VARCHAR(36),
  p_requester_id VARCHAR(36),
  p_psp_hold_id  VARCHAR(200)
) RETURNS JSON AS $$
DECLARE
  v_request RECORD;
BEGIN
  IF p_psp_hold_id IS NULL OR TRIM(p_psp_hold_id) = '' THEN
    RAISE EXCEPTION 'PSP hold id is required.';
  END IF;

  SELECT * INTO v_request FROM requests
  WHERE id = p_request_id
  AND requester_id = p_requester_id
  AND rq_status = 'payment_pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found, access denied, or order already finalized.';
  END IF;

  UPDATE requests
  SET rq_status   = 'escrow_locked',
      psp_hold_id = p_psp_hold_id,
      psp_paid_at = extract(epoch from now()) * 1000,
      updated_at  = extract(epoch from now()) * 1000
  WHERE id = p_request_id;

  RETURN (
    SELECT row_to_json(r)
    FROM (
      SELECT id, merchant, order_amount, platform_fee, incentive_fee,
             rq_status, psp_hold_id, updated_at
      FROM requests WHERE id = p_request_id
    ) r
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
      SELECT
        cards.id,
        cards.bank_name,
        cards.card_type,
        cards.card_tier,
        cards.allow_sharing,
        cards.created_at,
        u.payout_status
      FROM cards
      JOIN users u ON u.id = cards.user_id
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
      JOIN users u ON u.id = cards.user_id
      WHERE cards.user_id = p_friend_id
      AND cards.allow_sharing = 1
      AND u.payout_status = 'verified'
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


