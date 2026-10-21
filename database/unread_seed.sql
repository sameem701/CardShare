-- database/unread_seed.sql
--
-- Run this after testdata.sql.
-- Creates chat_reads and the two unread functions, then the read marks.
-- It does not change users. It accepts the Foodpanda request so that
-- order has a chat. Safe to run again.
--
-- A person's mark is the time of their own last message. Sending it means
-- they had opened the chat, so everything already there is read. Only the
-- other person's messages after that last reply count.
--
-- Sara, three orders:
--   Khaadi       2   Ahmed's two messages after her "Noted."
--   Daraz        4   Ahmed's message at 10:33 plus three after her 10:32 reply
--   Foodpanda    3   Bilal's three messages after the one she sent
-- Her tab is 9.
-- Ahmed and Bilal sent the later messages, so their own counts on these
-- orders are 0.
--
-- Log in as Sara 03001111111 and look before opening a chat.
--   Khaadi 2 and a green line
--   Daraz 4 and a green line
--   Foodpanda 3 and no green line
--   Junaid Jamshed a green line and no number
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

DELETE FROM chat_messages
WHERE id IN (
  'mmmmmmmm-00d2-4000-8000-000000000001',
  'mmmmmmmm-00d2-4000-8000-000000000002',
  'mmmmmmmm-00d2-4000-8000-000000000003',
  'mmmmmmmm-00d2-4000-8000-000000000004',
  'mmmmmmmm-00d2-4000-8000-000000000005',
  'mmmmmmmm-00d2-4000-8000-000000000006',
  'mmmmmmmm-00d2-4000-8000-000000000007',
  'mmmmmmmm-00d2-4000-8000-000000000008',
  'mmmmmmmm-00d2-4000-8000-000000000009',
  'mmmmmmmm-00d2-4000-8000-000000000010',
  'mmmmmmmm-00d2-4000-8000-000000000011',
  'mmmmmmmm-0002-4000-8000-000000000101',
  'mmmmmmmm-0002-4000-8000-000000000102',
  'mmmmmmmm-0002-4000-8000-000000000103',
  'mmmmmmmm-0002-4000-8000-000000000104',
  'mmmmmmmm-0002-4000-8000-000000000105',
  'mmmmmmmm-0002-4000-8000-000000000106',
  'mmmmmmmm-0002-4000-8000-000000000107',
  'mmmmmmmm-0002-4000-8000-000000000108'
);

UPDATE requests
SET rq_status = 'accepted',
    updated_at = (extract(epoch FROM timestamptz '2026-10-16 12:00:00+05') * 1000)::bigint
WHERE id = 'rrrrrrrr-0003-4000-8000-000000000003';

DELETE FROM chat_messages
WHERE id IN (
  'mmmmmmmm-00d2-4000-8000-000000000001',
  'mmmmmmmm-00d2-4000-8000-000000000002',
  'mmmmmmmm-00d2-4000-8000-000000000003',
  'mmmmmmmm-00d2-4000-8000-000000000004',
  'mmmmmmmm-00d2-4000-8000-000000000005',
  'mmmmmmmm-00d2-4000-8000-000000000006',
  'mmmmmmmm-00d2-4000-8000-000000000007',
  'mmmmmmmm-00d2-4000-8000-000000000008',
  'mmmmmmmm-00d2-4000-8000-000000000009',
  'mmmmmmmm-00d2-4000-8000-000000000010',
  'mmmmmmmm-00d2-4000-8000-000000000011',
  'mmmmmmmm-0002-4000-8000-000000000101',
  'mmmmmmmm-0002-4000-8000-000000000102',
  'mmmmmmmm-0002-4000-8000-000000000103',
  'mmmmmmmm-0002-4000-8000-000000000104',
  'mmmmmmmm-0002-4000-8000-000000000105',
  'mmmmmmmm-0002-4000-8000-000000000106',
  'mmmmmmmm-0002-4000-8000-000000000107',
  'mmmmmmmm-0002-4000-8000-000000000108',
  'mmmmmmmm-0003-4000-8000-000000000001',
  'mmmmmmmm-0003-4000-8000-000000000002',
  'mmmmmmmm-0003-4000-8000-000000000003',
  'mmmmmmmm-0003-4000-8000-000000000004'
);

INSERT INTO chat_messages (id, thread_id, sender_id, chat_message, attachment_path, created_at) VALUES
  ('mmmmmmmm-00d2-4000-8000-000000000001', 'rrrrrrrr-0001-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'Are you there?', NULL, (extract(epoch FROM timestamptz '2026-10-12 10:34:00+05') * 1000)::bigint),
  ('mmmmmmmm-00d2-4000-8000-000000000002', 'rrrrrrrr-0001-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'The receipt is the same.', NULL, (extract(epoch FROM timestamptz '2026-10-12 10:35:00+05') * 1000)::bigint),
  ('mmmmmmmm-00d2-4000-8000-000000000003', 'rrrrrrrr-0001-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'JazzCash is easier.', NULL, (extract(epoch FROM timestamptz '2026-10-12 10:36:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000101', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'The medium is in stock.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000102', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Paid. Receipt next.', NULL, (extract(epoch FROM timestamptz '2026-10-13 17:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0003-4000-8000-000000000001', 'rrrrrrrr-0003-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001', 'Please use the Askari card.', NULL, (extract(epoch FROM timestamptz '2026-10-16 12:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0003-4000-8000-000000000002', 'rrrrrrrr-0003-4000-8000-000000000003', 'aaaaaaaa-0003-4000-8000-000000000003', 'I can order this after 6.', NULL, (extract(epoch FROM timestamptz '2026-10-16 12:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0003-4000-8000-000000000003', 'rrrrrrrr-0003-4000-8000-000000000003', 'aaaaaaaa-0003-4000-8000-000000000003', 'Leave it at the gate, noted.', NULL, (extract(epoch FROM timestamptz '2026-10-16 12:15:00+05') * 1000)::bigint),
  ('mmmmmmmm-0003-4000-8000-000000000004', 'rrrrrrrr-0003-4000-8000-000000000003', 'aaaaaaaa-0003-4000-8000-000000000003', 'I will send the receipt after.', NULL, (extract(epoch FROM timestamptz '2026-10-16 12:20:00+05') * 1000)::bigint);

DELETE FROM chat_reads
WHERE thread_id IN (
  'rrrrrrrr-0001-4000-8000-000000000001',
  'rrrrrrrr-0002-4000-8000-000000000002',
  'rrrrrrrr-0003-4000-8000-000000000003'
);

INSERT INTO chat_reads (user_id, thread_id, last_read_at) VALUES
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0001-4000-8000-000000000001',
    (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (32 * 60000)
  ),
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0001-4000-8000-000000000001',
    (extract(epoch FROM timestamptz '2026-10-12 10:36:00+05') * 1000)::bigint
  ),
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 16:55:00+05') * 1000)::bigint
  ),
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 17:10:00+05') * 1000)::bigint
  ),
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0003-4000-8000-000000000003',
    (extract(epoch FROM timestamptz '2026-10-16 12:05:00+05') * 1000)::bigint
  ),
  (
    'aaaaaaaa-0003-4000-8000-000000000003',
    'rrrrrrrr-0003-4000-8000-000000000003',
    (extract(epoch FROM timestamptz '2026-10-16 12:20:00+05') * 1000)::bigint
  );

COMMIT;
