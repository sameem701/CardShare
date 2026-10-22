-- database/schema.sql
--
-- MVP: no in-app payments. Amounts are whole PKR.
-- Sara pays Ahmed outside the app after she accepts his proof.
-- Ahmed sets the transaction status to paid when that money has reached him.

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
  id         VARCHAR(36) PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);

/* ── CARDS ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS cards (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  bank_name     VARCHAR(100) NOT NULL CHECK (bank_name IN ('HBL', 'MCB', 'UBL', 'Meezan', 'Bank Alfalah', 'Faysal Bank', 'Standard Chartered', 'Askari', 'Silk Bank', 'Allied Bank', 'Habib Metro', 'JS Bank', 'Soneri Bank', 'Bank Al Habib')),
  card_tier     VARCHAR(50) NOT NULL CHECK (card_tier IN ('Classic', 'Gold', 'Platinum', 'Titanium', 'Signature', 'World')),
  allow_sharing INT NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL
);

/* ── CIRCLE (trust network) ─────────────────────────────────── */
CREATE TABLE IF NOT EXISTS circle (
  user_id              VARCHAR(36) NOT NULL REFERENCES users(id),
  friend_id            VARCHAR(36) NOT NULL REFERENCES users(id),
  c_status             VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (c_status IN ('pending', 'accepted', 'declined')),
  created_at           BIGINT NOT NULL,
  -- Name user_id uses for friend_id. Empty means use that person's account name.
  sender_contact_name  VARCHAR(100),
  -- Name friend_id uses for user_id. Empty until the invite is accepted.
  friend_contact_name  VARCHAR(100),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);

ALTER TABLE circle ADD COLUMN IF NOT EXISTS sender_contact_name VARCHAR(100);
ALTER TABLE circle ADD COLUMN IF NOT EXISTS friend_contact_name VARCHAR(100);

/* ── REQUESTS ───────────────────────────────────────────────── */
-- Live order. Deleted when it becomes a transaction.
-- A pending cancel or a decline deletes that one row. An accepted cancel, or Sara
-- accepting the proof, writes a transaction and moves the chat onto it first.
-- order_group_id is the same on every row from one Start order. Each person still
-- has their own id. The first accept keeps that row and deletes the other pending
-- rows in the group. Those rows are not restored if the winner later cancels.
-- The table only holds live orders, so one row per requester and card holder.
-- rq_status:
--   pending          — Sara created the request. No chat. Address hidden from Ahmed.
--   accepted         — Ahmed accepted. Address is visible, chat is open, he can shop.
--   proof_submitted  — Ahmed sent the receipt, the final original price, and the card charge
-- order_amount is the price of that checkout without this card. Ahmed can correct
-- it when he submits proof. It is prefilled with the price Sara entered.
-- The card charge is actual_amount_paid. His share is not stored on the request.
CREATE TABLE IF NOT EXISTS requests (
  id                 VARCHAR(36) PRIMARY KEY,
  order_group_id     VARCHAR(36) NOT NULL,
  requester_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  card_holder_id     VARCHAR(36) NOT NULL REFERENCES users(id),
  card_id            VARCHAR(36) NOT NULL REFERENCES cards(id),
  merchant           VARCHAR(100) NOT NULL,
  product_url        TEXT,
  delivery_address   TEXT NOT NULL,
  order_amount       INT NOT NULL CHECK (order_amount > 100),
  actual_amount_paid INT,
  note               TEXT,
  screenshot_url     VARCHAR(200),
  rq_status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (rq_status IN ('pending', 'accepted', 'proof_submitted')),
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);

ALTER TABLE requests ADD COLUMN IF NOT EXISTS order_group_id VARCHAR(36);
UPDATE requests SET order_group_id = id WHERE order_group_id IS NULL;
ALTER TABLE requests ALTER COLUMN order_group_id SET NOT NULL;

-- A row inserted without a group id is a group of one. The current single-person
-- create still works until it is replaced. A Start order that passes a group id
-- keeps that value.
CREATE OR REPLACE FUNCTION requests_set_order_group()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_group_id IS NULL THEN
    NEW.order_group_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS requests_order_group ON requests;
CREATE TRIGGER requests_order_group
  BEFORE INSERT ON requests
  FOR EACH ROW
  EXECUTE FUNCTION requests_set_order_group();

/* ── TRANSACTIONS ───────────────────────────────────────────── */
-- Written when Sara accepts proof, or when either person cancels an accepted request.
-- txn_status: unpaid, paid, cancelled_by_requester, cancelled_by_holder.
-- History is paid or either cancel. Unpaid stays open until Ahmed marks it paid.
-- cancel_reason is required for the two cancelled statuses.
-- Closed orders are a snapshot. Nothing here points at cards or users, so
-- deleting a card leaves the row, the amounts, and the copied names in place.
-- Dashboard totals read these columns. card_id is the id the card had, kept
-- so a card that still exists can show what it earned.
-- holder_share is 20% of order_amount minus actual_amount_paid, rounded to the
-- nearest rupee, stored when Sara accepts proof. It stays empty when the order
-- was cancelled before proof. She owes the card charge plus this share.
CREATE TABLE IF NOT EXISTS transactions (
  id                 VARCHAR(36) PRIMARY KEY,
  requester_id       VARCHAR(36) NOT NULL,
  requester_name     VARCHAR(100) NOT NULL,
  card_holder_id     VARCHAR(36) NOT NULL,
  card_holder_name   VARCHAR(100) NOT NULL,
  merchant           VARCHAR(100) NOT NULL,
  delivery_address   TEXT NOT NULL,
  order_amount       INT NOT NULL,
  card_id            VARCHAR(36),
  bank_name          VARCHAR(100) NOT NULL,
  card_tier          VARCHAR(50) NOT NULL,
  actual_amount_paid INT,
  holder_share       INT,
  screenshot_url     VARCHAR(200),
  txn_status         VARCHAR(30) NOT NULL
                       CHECK (txn_status IN (
                         'unpaid', 'paid',
                         'cancelled_by_requester', 'cancelled_by_holder'
                       )),
  cancel_reason      TEXT,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL,
  CHECK (
    (txn_status IN ('cancelled_by_requester', 'cancelled_by_holder')
      AND cancel_reason IS NOT NULL AND TRIM(cancel_reason) <> '')
    OR txn_status IN ('unpaid', 'paid')
  )
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_id VARCHAR(36);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS holder_share INT;

UPDATE transactions
SET holder_share = ROUND((order_amount - actual_amount_paid) * 0.2)::INT
WHERE actual_amount_paid IS NOT NULL
  AND actual_amount_paid <= order_amount
  AND holder_share IS NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_holder_share_nonnegative;
ALTER TABLE transactions ADD CONSTRAINT transactions_holder_share_nonnegative
  CHECK (holder_share IS NULL OR holder_share >= 0);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS requester_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_holder_name VARCHAR(100) NOT NULL DEFAULT '';

UPDATE transactions AS txn
SET requester_name = users.display_name
FROM users
WHERE users.id = txn.requester_id
  AND txn.requester_name = '';

UPDATE transactions AS txn
SET card_holder_name = users.display_name
FROM users
WHERE users.id = txn.card_holder_id
  AND txn.card_holder_name = '';

ALTER TABLE transactions ALTER COLUMN requester_name DROP DEFAULT;
ALTER TABLE transactions ALTER COLUMN card_holder_name DROP DEFAULT;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_card_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_requester_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_card_holder_id_fkey;

-- One transaction for either person. Includes an unpaid order, which history leaves out.
CREATE OR REPLACE FUNCTION get_transaction(
  p_txn_id  VARCHAR(36),
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM transactions
    WHERE id = p_txn_id
    AND (requester_id = p_user_id OR card_holder_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Transaction not found or access denied.';
  END IF;

  RETURN (
    SELECT row_to_json(t)
    FROM (
      SELECT
        txn.id,
        txn.requester_id,
        txn.requester_name,
        txn.card_holder_id,
        txn.card_holder_name,
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
        txn.updated_at
      FROM transactions txn
      WHERE txn.id = p_txn_id
    ) t
  );
END;
$$ LANGUAGE plpgsql;

/* ── CHAT ───────────────────────────────────────────────────── */
-- thread_id is the request id while the order is live.
-- When the request becomes a transaction, messages are updated to that transaction id.
CREATE TABLE IF NOT EXISTS chat_messages (
  id              VARCHAR(36) PRIMARY KEY,
  thread_id       VARCHAR(36) NOT NULL,
  sender_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  chat_message    TEXT,
  attachment_path VARCHAR(200),
  created_at      BIGINT NOT NULL,
  CONSTRAINT chat_message_has_content CHECK (
    chat_message IS NOT NULL OR attachment_path IS NOT NULL
  )
);


/* ── INDEXES for performance ────────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_cards_user          ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_user         ON circle(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_friend       ON circle(friend_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester  ON requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_holder     ON requests(card_holder_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_one_live_pair ON requests(requester_id, card_holder_id);
DROP INDEX IF EXISTS idx_requests_requester_holder;
CREATE INDEX IF NOT EXISTS idx_requests_order_group ON requests(order_group_id);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(rq_status);
CREATE INDEX IF NOT EXISTS idx_txn_requester       ON transactions(requester_id);
CREATE INDEX IF NOT EXISTS idx_txn_holder          ON transactions(card_holder_id);
CREATE INDEX IF NOT EXISTS idx_txn_card            ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_chat_thread        ON chat_messages(thread_id);


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

  INSERT INTO sessions (id, user_id, created_at)
  VALUES (v_session_id, p_user_id, extract(epoch from now()) * 1000);

  RETURN json_build_object('session_id', v_session_id);
END;
$$ LANGUAGE plpgsql;


-- Session row must match this session id and user id.
-- Sent on every request so as to validate the user session
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
   CARDS
   User adds cards, toggles sharing, then circle members can see them
   ───────────────────────────────────────────────────────────── */

-- Drops the old form that also took card_type.
DROP PROCEDURE IF EXISTS add_card(VARCHAR, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE PROCEDURE add_card(
  p_user_id   VARCHAR(36),
  p_bank_name VARCHAR(100),
  p_card_tier VARCHAR(50)
) AS $$
BEGIN
  INSERT INTO cards (id, user_id, bank_name, card_tier, created_at)
  VALUES (uuid_generate_v4()::varchar, p_user_id, p_bank_name, p_card_tier, extract(epoch from now()) * 1000);
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
        cards.card_tier,
        cards.allow_sharing,
        cards.created_at
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
    AND rq_status IN ('pending', 'accepted', 'proof_submitted')
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
         or cancel_circle_invite
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
  IF p_user_id = p_friend_id THEN
    RAISE EXCEPTION 'You cannot add yourself to your circle.';
  END IF;

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


-- Blocked while a live request exists between the two users
CREATE OR REPLACE PROCEDURE remove_from_circle(
  p_user_id   VARCHAR(36),
  p_friend_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM requests
    WHERE rq_status IN ('pending', 'accepted', 'proof_submitted')
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


-- Sender withdraws an invite that is still pending.
-- Accepted rows stay. A decline or a missing row is no longer pending.
CREATE OR REPLACE PROCEDURE cancel_circle_invite(
  p_user_id   VARCHAR(36),
  p_friend_id VARCHAR(36)
) AS $$
DECLARE
  v_status VARCHAR(20);
BEGIN
  DELETE FROM circle
  WHERE user_id = p_user_id
  AND friend_id = p_friend_id
  AND c_status = 'pending';

  IF FOUND THEN
    RETURN;
  END IF;

  SELECT c_status INTO v_status
  FROM circle
  WHERE user_id = p_user_id AND friend_id = p_friend_id;

  IF v_status = 'accepted' THEN
    RAISE EXCEPTION 'They already accepted.';
  END IF;

  RAISE EXCEPTION 'No pending invite found.';
END;
$$ LANGUAGE plpgsql;


-- Saves the name the logged-in person uses for the other person.
-- The sender may set a name while the invite is pending.
-- The receiver may set a name only after accepting.
-- A blank value or a phone number clears the column.
CREATE OR REPLACE PROCEDURE set_circle_contact_name(
  p_viewer_id VARCHAR(36),
  p_person_id VARCHAR(36),
  p_name      VARCHAR(100)
) AS $$
DECLARE
  v_user_id   VARCHAR(36);
  v_friend_id VARCHAR(36);
  v_status    VARCHAR(20);
  v_name      VARCHAR(100);
BEGIN
  IF p_viewer_id = p_person_id THEN
    RAISE EXCEPTION 'You cannot save a contact name for yourself.';
  END IF;

  SELECT user_id, friend_id, c_status
  INTO v_user_id, v_friend_id, v_status
  FROM circle
  WHERE (user_id = p_viewer_id AND friend_id = p_person_id)
  OR (user_id = p_person_id AND friend_id = p_viewer_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No circle row found.';
  END IF;

  v_name := NULLIF(TRIM(p_name), '');
  IF v_name IS NOT NULL AND char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Contact name must be 100 characters or fewer.';
  END IF;
  IF v_name IS NOT NULL AND regexp_replace(v_name, '[[:space:]()+.-]', '', 'g') ~ '^[0-9]+$' THEN
    v_name := NULL;
  END IF;

  IF v_user_id = p_viewer_id AND v_friend_id = p_person_id THEN
    UPDATE circle
    SET sender_contact_name = v_name
    WHERE user_id = v_user_id AND friend_id = v_friend_id;
    RETURN;
  END IF;

  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'Accept the invite before saving a contact name.';
  END IF;

  UPDATE circle
  SET friend_contact_name = v_name
  WHERE user_id = v_user_id AND friend_id = v_friend_id;
END;
$$ LANGUAGE plpgsql;


-- is_sender = true → logged-in user sent the invite (show Cancel button)
-- is_sender = false → logged-in user received the invite (show Accept/Decline)
-- contact_name is the logged-in person's own label for the other person.
-- display_name stays the account name.
CREATE OR REPLACE FUNCTION get_circle(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(c), '[]'::json)
    FROM (
      SELECT u.id, u.display_name, u.phone, ci.c_status, TRUE AS is_sender,
             ci.sender_contact_name AS contact_name
      FROM circle ci
      JOIN users u ON u.id = ci.friend_id
      WHERE ci.user_id = p_user_id
      UNION
      SELECT u.id, u.display_name, u.phone, ci.c_status, FALSE AS is_sender,
             ci.friend_contact_name AS contact_name
      FROM circle ci
      JOIN users u ON u.id = ci.user_id
      WHERE ci.friend_id = p_user_id
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Returns cards the friend is sharing. Caller must already be in an accepted circle.
-- Called by Sara when selecting which card to use for a request.
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
      SELECT cards.id, cards.bank_name, cards.card_tier
      FROM cards
      WHERE cards.user_id = p_friend_id
      AND cards.allow_sharing = 1
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Accepted circle members who are sharing this bank and tier.
-- Two cards of the same bank and tier use the newer card.
-- has_live_order is true when the viewer already has a live request with that person.
-- contact_name is the viewer's own label. display_name stays the account name.
CREATE OR REPLACE FUNCTION get_holders_for_card(
  p_user_id   VARCHAR(36),
  p_bank_name VARCHAR(100),
  p_card_tier VARCHAR(50)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(h ORDER BY h.display_name, h.id), '[]'::json)
    FROM (
      SELECT DISTINCT ON (u.id)
        u.id,
        u.display_name,
        u.phone,
        f.contact_name,
        c.id AS card_id,
        EXISTS (
          SELECT 1 FROM requests r
          WHERE r.requester_id = p_user_id
          AND r.card_holder_id = u.id
        ) AS has_live_order
      FROM (
        SELECT friend_id AS person_id, sender_contact_name AS contact_name
        FROM circle
        WHERE user_id = p_user_id AND c_status = 'accepted'
        UNION ALL
        SELECT user_id AS person_id, friend_contact_name AS contact_name
        FROM circle
        WHERE friend_id = p_user_id AND c_status = 'accepted'
      ) f
      JOIN users u ON u.id = f.person_id
      JOIN cards c ON c.user_id = u.id
        AND c.allow_sharing = 1
        AND c.bank_name = p_bank_name
        AND c.card_tier = p_card_tier
      ORDER BY u.id, c.created_at DESC
    ) h
  );
END;
$$ LANGUAGE plpgsql;


/* ─────────────────────────────────────────────────────────────
   CHAT
   Available once Ahmed has accepted: accepted, proof_submitted
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
    AND rq_status IN ('accepted', 'proof_submitted')
  ) THEN
    RAISE EXCEPTION 'Request not found or chat not available.';
  END IF;

  v_message := NULLIF(TRIM(p_message), '');
  v_attachment := NULLIF(TRIM(p_attachment_path), '');

  IF v_message IS NULL AND v_attachment IS NULL THEN
    RAISE EXCEPTION 'Message or attachment is required.';
  END IF;

  INSERT INTO chat_messages (
    id, thread_id, sender_id, chat_message, attachment_path, created_at
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


-- Newest 30 messages, or the 30 older than the cursor. A call with only
-- thread id and user id still works and returns the newest page.
DROP FUNCTION IF EXISTS get_messages(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION get_messages(
  p_thread_id         VARCHAR(36),
  p_user_id           VARCHAR(36),
  p_before_created_at BIGINT DEFAULT NULL,
  p_before_id         VARCHAR(36) DEFAULT NULL,
  p_limit             INT DEFAULT 30
) RETURNS JSON AS $$
DECLARE
  v_limit INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_thread_id
    AND (requester_id = p_user_id OR card_holder_id = p_user_id)
  ) AND NOT EXISTS (
    SELECT 1 FROM transactions
    WHERE id = p_thread_id
    AND (requester_id = p_user_id OR card_holder_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  v_limit := 30;
  IF p_limit IS NOT NULL AND p_limit BETWEEN 1 AND 30 THEN
    v_limit := p_limit;
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(m ORDER BY m.created_at ASC, m.id ASC), '[]'::json)
    FROM (
      SELECT cm.id, cm.sender_id, u.display_name AS sender_name,
             cm.chat_message, cm.attachment_path, cm.created_at
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.thread_id = p_thread_id
      AND (
        p_before_created_at IS NULL
        OR cm.created_at < p_before_created_at
        OR (
          cm.created_at = p_before_created_at
          AND p_before_id IS NOT NULL
          AND cm.id < p_before_id
        )
      )
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT v_limit
    ) m
  );
END;
$$ LANGUAGE plpgsql;


/* ── UNREAD CHAT ON LIVE REQUESTS ─────────────────────────────
   One row is one person on one chat. thread_id is the request id
   while the order is Accepted or Proof sent. It becomes the
   transaction id only when the messages are moved.
   No row means he has not opened the chat, so every message from
   the other person counts as unread. His own messages never count.
   The Request-tab total is not stored here. */
CREATE TABLE IF NOT EXISTS chat_reads (
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id),
  thread_id    VARCHAR(36) NOT NULL,
  last_read_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reads_thread ON chat_reads(thread_id);


-- Per live request he is on. Pending is excluded because chat is closed.
CREATE OR REPLACE FUNCTION get_request_unread_counts(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(r), '[]'::json)
    FROM (
      SELECT
        req.id AS request_id,
        (
          SELECT COUNT(*)::INT
          FROM chat_messages cm
          WHERE cm.thread_id = req.id
          AND cm.sender_id <> p_user_id
          AND cm.created_at > COALESCE(
            (
              SELECT cr.last_read_at
              FROM chat_reads cr
              WHERE cr.user_id = p_user_id
              AND cr.thread_id = req.id
            ),
            0
          )
        ) AS unread_count
      FROM requests req
      WHERE (req.requester_id = p_user_id OR req.card_holder_id = p_user_id)
      AND req.rq_status IN ('accepted', 'proof_submitted')
    ) r
  );
END;
$$ LANGUAGE plpgsql;


-- Opening a chat marks up to one message on screen. The caller must be
-- on that order, and the message must belong to that chat. The mark only
-- moves forward. Returns how many of the other person's messages are still
-- after the mark.
DROP FUNCTION IF EXISTS mark_chat_read(VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION mark_chat_read(
  p_thread_id  VARCHAR(36),
  p_user_id    VARCHAR(36),
  p_message_id VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_message_at BIGINT;
  v_read_at    BIGINT;
  v_unread     INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM requests
    WHERE id = p_thread_id
    AND (requester_id = p_user_id OR card_holder_id = p_user_id)
  ) AND NOT EXISTS (
    SELECT 1 FROM transactions
    WHERE id = p_thread_id
    AND (requester_id = p_user_id OR card_holder_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Request not found or access denied.';
  END IF;

  SELECT created_at INTO v_message_at
  FROM chat_messages
  WHERE id = p_message_id
  AND thread_id = p_thread_id;

  IF v_message_at IS NULL THEN
    RAISE EXCEPTION 'Message not found.';
  END IF;

  INSERT INTO chat_reads (user_id, thread_id, last_read_at)
  VALUES (p_user_id, p_thread_id, v_message_at)
  ON CONFLICT (user_id, thread_id)
  DO UPDATE SET last_read_at = GREATEST(chat_reads.last_read_at, EXCLUDED.last_read_at)
  RETURNING last_read_at INTO v_read_at;

  SELECT COUNT(*)::INT INTO v_unread
  FROM chat_messages cm
  WHERE cm.thread_id = p_thread_id
  AND cm.sender_id <> p_user_id
  AND cm.created_at > v_read_at;

  RETURN json_build_object(
    'thread_id',    p_thread_id,
    'last_read_at', v_read_at,
    'unread_count', v_unread
  );
END;
$$ LANGUAGE plpgsql;

