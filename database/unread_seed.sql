-- database/unread_seed.sql
--
-- Run this after testdata.sql.
-- Creates chat_reads and the two unread functions, then the read marks.
-- It does not change users, orders, or messages.
-- Safe to run again: it replaces these read marks.
--
-- Each mark is the last message that person had reached by opening the chat.
-- Anything from the other person after that mark is unread.
--
-- Daraz, messages every minute from 2026-10-12 10:00 +05.
-- Odd ones are Ahmed's. Even ones are Sara's.
--   Sara opened through her message 10. Ahmed's later messages: 12. Badge +9.
--   Ahmed opened through his message 21. Sara's later messages: 6.
-- Khaadi already ends with Sara's "Noted." at 16:55. This adds messages after that.
--   Sara's mark stays on "Noted." Ahmed's five later messages are unread.
--   Ahmed's mark stays on his 16:40 message. Sara's "Noted." plus her three
--   later messages are unread: 4.
--
-- Log in as:
--   Sara   03001111111   green dot, tab +9
--                        Daraz +9 and a green line
--                        Khaadi 5 and a green line
--                        Junaid Jamshed a green line and no number
--                        Foodpanda neither
--   Ahmed  03002222222   no green dot, tab +9
--                        Daraz 6 and no green line
--                        Khaadi 4 and no green line
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

DELETE FROM chat_messages
WHERE id IN (
  'mmmmmmmm-0002-4000-8000-000000000101',
  'mmmmmmmm-0002-4000-8000-000000000102',
  'mmmmmmmm-0002-4000-8000-000000000103',
  'mmmmmmmm-0002-4000-8000-000000000104',
  'mmmmmmmm-0002-4000-8000-000000000105',
  'mmmmmmmm-0002-4000-8000-000000000106',
  'mmmmmmmm-0002-4000-8000-000000000107',
  'mmmmmmmm-0002-4000-8000-000000000108'
);

INSERT INTO chat_messages (id, thread_id, sender_id, chat_message, attachment_path, created_at) VALUES
  ('mmmmmmmm-0002-4000-8000-000000000101', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'The medium is in stock.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000102', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'I am at the till.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000103', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'They have the navy one too.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:15:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000104', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Taking the navy medium.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:20:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000105', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Paid. Receipt next.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:25:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000106', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Navy is fine.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:30:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000107', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Send the receipt when you can.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:35:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000108', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'I will check it tonight.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:40:00+05') * 1000)::bigint);

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
    (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (21 * 60000)
  ),
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0001-4000-8000-000000000001',
    (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (10 * 60000)
  ),
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 16:55:00+05') * 1000)::bigint
  ),
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 16:40:00+05') * 1000)::bigint
  );

COMMIT;
