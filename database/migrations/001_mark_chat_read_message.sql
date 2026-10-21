-- Mark read up to one message the caller can see.
-- The caller must be on that order. The message must be in that chat.
-- The mark only moves forward. The unread count is what is still after it.

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
