const db = require('../config/db');
const { isSupabaseConfigured } = require('../config/supabase');
const {
  createChatImageUploadSlot,
  verifyChatImageFile,
  attachSignedChatImageUrls,
  validateAttachmentPath,
} = require('../utils/chatImageStorage');

const requireRequestId = (req, res) => {
  const request_id = req.params.request_id;
  if (!request_id || String(request_id).trim() === '') {
    res.status(400).json({ error: 'request_id is required.' });
    return null;
  }
  return request_id;
};

const assertChatAvailable = async (request_id, user_id) => {
  const { rows } = await db.query(
    `SELECT 1 FROM requests
     WHERE id = $1
     AND (requester_id = $2 OR card_holder_id = $2)
     AND rq_status IN ('pending', 'payment_pending', 'escrow_locked', 'tracking_submitted')`,
    [request_id, user_id]
  );

  if (!rows.length) {
    throw new Error('Request not found or chat not available.');
  }
};

// GET /api/chat/:request_id
// Chat history for an order (requester or holder only)
const getMessages = async (req, res) => {
  const user_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      'SELECT get_messages($1, $2) AS result',
      [request_id, user_id]
    );
    res.json(await attachSignedChatImageUrls(rows[0].result ?? []));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/chat/:request_id/image/upload-url
// Presigned upload for one optional image per message
const getChatImageUploadUrl = async (req, res) => {
  const user_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Chat image storage is not configured.' });
  }

  try {
    await assertChatAvailable(request_id, user_id);
    const upload = await createChatImageUploadSlot(request_id, req.body?.extension);
    res.status(201).json(upload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/chat/:request_id
// Send text and/or one image on an active order
const sendMessage = async (req, res) => {
  const user_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  const { message, attachment_path } = req.body;
  const text = message ? String(message).trim() : '';
  const attachment = attachment_path ? String(attachment_path).trim() : '';

  if (!text && !attachment) {
    return res.status(400).json({ error: 'message or attachment_path is required.' });
  }

  if (attachment) {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Chat image storage is not configured.' });
    }

    const pathCheck = validateAttachmentPath(attachment, request_id);
    if (!pathCheck.ok) {
      return res.status(400).json({ error: pathCheck.error });
    }

    const fileCheck = await verifyChatImageFile(pathCheck.path);
    if (!fileCheck.ok) {
      return res.status(400).json({ error: fileCheck.error });
    }
  }

  try {
    await db.query('CALL send_message($1, $2, $3, $4)', [
      request_id,
      user_id,
      text || null,
      attachment || null,
    ]);
    res.status(201).json({ message: 'Message sent.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { getMessages, getChatImageUploadUrl, sendMessage };
