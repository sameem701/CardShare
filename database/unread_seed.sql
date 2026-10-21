-- database/unread_seed.sql
--
-- Run this after testdata.sql.
-- Creates chat_reads and the two unread functions, then the read marks.
-- It does not change users, orders, or messages.
-- Safe to run again: it replaces these read marks.
--
-- Daraz messages are every minute from 2026-10-12 10:00 +05.
-- Odd ones are Ahmed's. Even ones are Sara's. There are 33.
-- Sara has no read mark on Daraz, so all 17 of Ahmed's messages count.
--
-- Log in as:
--   Sara   03001111111   green dot, tab +9
--                        Daraz +9 and a green line
--                        Khaadi 1 and a green line
--                        Junaid Jamshed a green line and no number
--                        Foodpanda neither
--   Ahmed  03002222222   no green dot, tab number 2
--                        Daraz 1 and no green line
--                        Khaadi 1 and no green line
--   Bilal  03003333333   green dot, no tab number
--                        Foodpanda a green line and no number
--                        Junaid Jamshed neither
--
-- Opening a chat marks it read. Come back to the tabs and that number drops.

BEGIN;

CREATE TABLE IF NOT EXISTS chat_reads (
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id),
  thread_id    VARCHAR(36) NOT NULL,
  last_read_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reads_thread ON chat_reads(thread_id);

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

CREATE OR REPLACE FUNCTION mark_chat_read(
  p_thread_id VARCHAR(36),
  p_user_id   VARCHAR(36)
) RETURNS JSON AS $$
DECLARE
  v_latest BIGINT;
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

  SELECT MAX(created_at) INTO v_latest
  FROM chat_messages
  WHERE thread_id = p_thread_id;

  IF v_latest IS NULL THEN
    v_latest := (extract(epoch from now()) * 1000)::BIGINT;
  END IF;

  INSERT INTO chat_reads (user_id, thread_id, last_read_at)
  VALUES (p_user_id, p_thread_id, v_latest)
  ON CONFLICT (user_id, thread_id)
  DO UPDATE SET last_read_at = GREATEST(chat_reads.last_read_at, EXCLUDED.last_read_at);

  RETURN json_build_object(
    'thread_id',    p_thread_id,
    'last_read_at', v_latest
  );
END;
$$ LANGUAGE plpgsql;

DELETE FROM chat_reads
WHERE user_id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002'
)
AND thread_id IN (
  'rrrrrrrr-0001-4000-8000-000000000001',
  'rrrrrrrr-0002-4000-8000-000000000002'
);

INSERT INTO chat_reads (user_id, thread_id, last_read_at) VALUES
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0001-4000-8000-000000000001',
    (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (31 * 60000)
  ),
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 16:25:00+05') * 1000)::bigint
  ),
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 16:40:00+05') * 1000)::bigint
  );

COMMIT;
