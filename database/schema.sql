-- database/schema.sql

/* ── EXTENSIONS ────────────────────────────────────────────── */
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/* ── USERS ─────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(36) PRIMARY KEY,
  phone           VARCHAR(20) UNIQUE NOT NULL,
  display_name    VARCHAR(100),
  pin_hash TEXT, 
  wallet_balance  INT NOT NULL DEFAULT 0,
  security_question    TEXT,
  security_answer_hash TEXT
  created_at      BIGINT NOT NULL
);

/* ── OTPs ───────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS otps (
  phone       VARCHAR(20) PRIMARY KEY,
  otp_hash    TEXT NOT NULL,
  expires_at  BIGINT NOT NULL,
  last_sent_at BIGINT NOT NULL,
  attempts    INT NOT NULL DEFAULT 0
);

/* ── CARDS ──────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS cards (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  bank_name     VARCHAR(100) NOT NULL CHECK (bank_name IN ('HBL', 'MCB', 'UBL', 'Meezan', 'Bank Alfalah', 'Faysal Bank', 'Standard Chartered', 'Askari', 'Silk Bank', 'Allied Bank', 'Habib Metro', 'JS Bank', 'Soneri Bank', 'Bank Al Habib')),
  card_type     VARCHAR(50) NOT NULL CHECK (card_type IN ('Visa', 'Mastercard', 'UnionPay', 'PayPak', 'Amex')),
  card_tier     VARCHAR(50) NOT NULL CHECK (card_tier IN ('Classic', 'Gold', 'Platinum', 'Titanium', 'Signature', 'World')),
  allow_sharing INT NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL
);

/* ── CIRCLE (trust network) ─────────────────────────────── */
CREATE TABLE IF NOT EXISTS circle (
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id),
  friend_id   VARCHAR(36) NOT NULL REFERENCES users(id),
  c_status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  BIGINT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

/* ── REQUESTS ───────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS requests (
  id                VARCHAR(36) PRIMARY KEY,
  requester_id      VARCHAR(36) NOT NULL REFERENCES users(id),
  card_holder_id    VARCHAR(36) NOT NULL REFERENCES users(id),
  card_id           VARCHAR(36) NOT NULL REFERENCES cards(id),
  merchant          VARCHAR(100) NOT NULL,
  product_url       TEXT,
  delivery_address  TEXT NOT NULL,
  order_amount      INT NOT NULL,
  note              TEXT,
  rq_status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at        BIGINT NOT NULL,
  created_at        BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

/* ── TRANSACTIONS ───────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS transactions (
  id                    VARCHAR(36) PRIMARY KEY,
  request_id            VARCHAR(36) NOT NULL REFERENCES requests(id),
  order_amount          INT NOT NULL,
  platform_fee          INT NOT NULL DEFAULT 0,
  incentive_fee         INT NOT NULL DEFAULT 0,
  total_paid            INT NOT NULL,
  txn_status               VARCHAR(20) NOT NULL DEFAULT 'escrow_locked',
  tracking_id           VARCHAR(200),
  delivery_expected_at  BIGINT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);


/* ── CHAT ───────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS chat_messages (
  id              VARCHAR(36) PRIMARY KEY,
  request_id      VARCHAR(36) NOT NULL REFERENCES requests(id),
  sender_id       VARCHAR(36) NOT NULL REFERENCES users(id),
  chat_message         TEXT NOT NULL,
  created_at      BIGINT NOT NULL
);


/* ── INDEXES for performance ────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_otps_phone           ON otps(phone);
CREATE INDEX IF NOT EXISTS idx_cards_user           ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_user          ON circle(user_id);
CREATE INDEX IF NOT EXISTS idx_circle_friend        ON circle(friend_id);
CREATE INDEX IF NOT EXISTS idx_requests_requester   ON requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_holder      ON requests(card_holder_id);
CREATE INDEX IF NOT EXISTS idx_requests_status      ON requests(rq_status);
CREATE INDEX IF NOT EXISTS idx_txn_request          ON transactions(request_id);
CREATE INDEX IF NOT EXISTS idx_chat_request         ON chat_messages(request_id);


/* ── COMMON PROCEDURES ──────────────────────────────────── */

-- Login or create user
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
      SELECT id, phone, display_name, wallet_balance
      FROM users WHERE id = v_user_id
    ) u
  );
END;
$$ LANGUAGE plpgsql;


-- Update Profile
CREATE OR REPLACE PROCEDURE update_profile(
  p_user_id VARCHAR(36),
  p_display_name VARCHAR(100)
) AS $$
BEGIN
  UPDATE users 
  SET display_name = p_display_name
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- Add Card
CREATE OR REPLACE PROCEDURE add_card(
  p_user_id VARCHAR(36),
  p_bank_name VARCHAR(100),
  p_card_type VARCHAR(50),
  p_card_tier VARCHAR(50)
) AS $$
BEGIN
  INSERT INTO cards (id, user_id, bank_name, card_type, card_tier, created_at)
  VALUES (uuid_generate_v4()::varchar, p_user_id, p_bank_name, p_card_type, p_card_tier, extract(epoch from now()) * 1000);
END;
$$ LANGUAGE plpgsql;


-- Get Cards
CREATE OR REPLACE FUNCTION get_cards(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(c)
    FROM (
      SELECT id, bank_name, card_type, card_tier, allow_sharing, created_at
      FROM cards
      WHERE user_id = p_user_id
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Toggle Card Sharing
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


-- Get Circle
CREATE OR REPLACE FUNCTION get_circle(
  p_user_id VARCHAR(36)
) RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(c)
    FROM (
      SELECT u.id, u.display_name, u.phone, ci.c_status
      FROM circle ci
      JOIN users u ON u.id = ci.friend_id
      WHERE ci.user_id = p_user_id
      UNION
      SELECT u.id, u.display_name, u.phone, ci.c_status
      FROM circle ci
      JOIN users u ON u.id = ci.user_id
      WHERE ci.friend_id = p_user_id
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Add to Circle
CREATE OR REPLACE PROCEDURE add_to_circle(
  p_user_id VARCHAR(36),
  p_friend_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM circle 
    WHERE (user_id = p_user_id AND friend_id = p_friend_id)
    OR (user_id = p_friend_id AND friend_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Already in circle or invite pending.';
  END IF;

  INSERT INTO circle (user_id, friend_id, c_status, created_at)
  VALUES (p_user_id, p_friend_id, 'pending', extract(epoch from now()) * 1000);
END;
$$ LANGUAGE plpgsql;


-- Respond to Circle Invite
CREATE OR REPLACE PROCEDURE respond_to_circle_invite(
  p_user_id VARCHAR(36),
  p_friend_id VARCHAR(36),
  p_status VARCHAR(20)
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


-- Remove from Circle
CREATE OR REPLACE PROCEDURE remove_from_circle(
  p_user_id VARCHAR(36),
  p_friend_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM requests
    WHERE rq_status NOT IN ('completed', 'expired', 'declined')
    AND (
      (requester_id = p_user_id AND card_holder_id = p_friend_id)
      OR (requester_id = p_friend_id AND card_holder_id = p_user_id)
    )
  ) THEN
    RAISE EXCEPTION 'Cannot remove. There is a pending order with this user.';
  END IF;

  DELETE FROM circle
  WHERE (user_id = p_user_id AND friend_id = p_friend_id)
  OR (user_id = p_friend_id AND friend_id = p_user_id);
END;
$$ LANGUAGE plpgsql;


-- Get User Profile
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


-- Store OTP
CREATE OR REPLACE PROCEDURE store_otp(
  p_phone VARCHAR(20),
  p_otp_hash TEXT,
  p_expires_at BIGINT
) AS $$
BEGIN
  INSERT INTO otps (phone, otp_hash, expires_at, attempts)
  VALUES (p_phone, p_otp_hash, p_expires_at, 0)
  ON CONFLICT (phone) DO UPDATE
  SET otp_hash = p_otp_hash,
      expires_at = p_expires_at,
      attempts = 0;
END;
$$ LANGUAGE plpgsql;



-- Verify OTP
CREATE OR REPLACE FUNCTION verify_otp(
  p_phone VARCHAR(20),
  p_otp_hash TEXT
) RETURNS JSON AS $$
DECLARE
  v_otp RECORD;
  v_user JSON;
BEGIN
  SELECT * INTO v_otp FROM otps WHERE phone = p_phone;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No OTP found for this number.';
  END IF;

  IF (extract(epoch from now()) * 1000) > v_otp.expires_at THEN
    DELETE FROM otps WHERE phone = p_phone;
    RAISE EXCEPTION 'OTP has expired.';
  END IF;

  IF v_otp.attempts >= 3 THEN
    RAISE EXCEPTION 'Maximum attempts reached. Please request a new OTP.';
  END IF;

  IF v_otp.otp_hash != p_otp_hash THEN
    UPDATE otps SET attempts = attempts + 1 WHERE phone = p_phone;
    RAISE EXCEPTION 'Invalid OTP.';
  END IF;

  -- OTP is correct, delete it
  DELETE FROM otps WHERE phone = p_phone;

  -- Login or create user
  v_user := login_or_create_user(p_phone);

  RETURN v_user;
END;
$$ LANGUAGE plpgsql;



-- Upsert PIN
CREATE OR REPLACE PROCEDURE upsert_pin(
  p_user_id VARCHAR(36),
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


-- Verify PIN
CREATE OR REPLACE FUNCTION verify_pin(
  p_phone VARCHAR(20),
  p_pin_hash TEXT
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

  IF v_user.pin_hash != p_pin_hash THEN
    RAISE EXCEPTION 'Invalid PIN.';
  END IF;

  RETURN (
    SELECT row_to_json(u)
    FROM (
      SELECT id, phone, display_name, wallet_balance
      FROM users WHERE id = v_user.id
    ) u
  );
END;
$$ LANGUAGE plpgsql;


-- Set Security Question and Answer
CREATE OR REPLACE PROCEDURE set_security_question(
  p_user_id VARCHAR(36),
  p_security_question TEXT,
  p_security_answer_hash TEXT
) AS $$
BEGIN
  UPDATE users
  SET security_question = p_security_question,
      security_answer_hash = p_security_answer_hash
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
END;
$$ LANGUAGE plpgsql;



-- Delete Card
CREATE OR REPLACE PROCEDURE delete_card(
  p_user_id VARCHAR(36),
  p_card_id VARCHAR(36)
) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM requests
    WHERE card_id = p_card_id
    AND rq_status NOT IN ('completed', 'expired', 'declined')
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


-- Get Circle Member Cards
CREATE OR REPLACE FUNCTION get_circle_cards(
  p_user_id VARCHAR(36),
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
    SELECT json_agg(c)
    FROM (
      SELECT id, bank_name, card_type, card_tier
      FROM cards
      WHERE user_id = p_friend_id
      AND allow_sharing = 1
    ) c
  );
END;
$$ LANGUAGE plpgsql;


-- Auto Expire Requests
CREATE OR REPLACE PROCEDURE auto_expire_requests() AS $$
BEGIN
  -- Expire pending requests after 15 mins
  UPDATE requests
  SET rq_status = 'expired'
  WHERE rq_status = 'pending'
  AND expires_at < (extract(epoch from now()) * 1000);

  -- Expire accepted requests where Sara hasn't locked escrow within 30 mins
  UPDATE requests
  SET rq_status = 'expired'
  WHERE rq_status = 'accepted'
  AND (extract(epoch from now()) * 1000) > (updated_at + 1800000);
END;
$$ LANGUAGE plpgsql;



-- Auto Release Escrow
CREATE OR REPLACE PROCEDURE auto_release_escrow() AS $$
DECLARE
  v_txn RECORD;
BEGIN
  FOR v_txn IN
    SELECT t.*, r.requester_id, r.card_holder_id
    FROM transactions t
    JOIN requests r ON r.id = t.request_id
    WHERE t.txn_status = 'escrow_locked'
    AND (extract(epoch from now()) * 1000) > (t.created_at + 3600000)
  LOOP
    -- Release escrow back to requester
    UPDATE users
    SET wallet_balance = wallet_balance + v_txn.total_paid
    WHERE id = v_txn.requester_id;

    -- Mark transaction as refunded
    UPDATE transactions
    SET txn_status = 'refunded',
        updated_at = extract(epoch from now()) * 1000
    WHERE id = v_txn.id;

    -- Mark request as expired
    UPDATE requests
    SET rq_status = 'expired',
        updated_at = extract(epoch from now()) * 1000
    WHERE id = v_txn.request_id;

  END LOOP;
END;
$$ LANGUAGE plpgsql;