const db = require('../config/db');

const ALLOWED_INVITE_RESPONSES = ['accepted', 'declined'];

// Empty, or a value that is only a phone number, is not stored.
// A name longer than the column is rejected before any circle call.
function storedContactName(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > 100) {
    throw new Error('Contact name must be 100 characters or fewer.');
  }
  const stripped = trimmed.replace(/[\s()+.-]/g, '');
  if (/^[0-9]+$/.test(stripped)) return null;
  return trimmed;
}

async function saveContactName(viewerId, personId, name) {
  if (!name) return;
  await db.query('CALL set_circle_contact_name($1, $2, $3)', [viewerId, personId, name]);
}

// POST /api/circle/invite
// Send a circle invite (use profile find-by-phone first to get friend_id)
const sendInvite = async (req, res) => {
  const user_id = req.user.id;
  const { friend_id } = req.body;

  if (!friend_id || String(friend_id).trim() === '') {
    return res.status(400).json({ error: 'friend_id is required.' });
  }

  if (friend_id === user_id) {
    return res.status(400).json({ error: 'You cannot invite yourself.' });
  }

  try {
    const contactName = storedContactName(req.body?.contact_name);
    await db.query('CALL add_to_circle($1, $2)', [user_id, friend_id]);
    await saveContactName(user_id, friend_id, contactName);
    res.status(201).json({ message: 'Circle invite sent.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/circle/invite/:friend_id
// Accept or decline an invite from friend_id (the person who sent it)
const respondToInvite = async (req, res) => {
  const user_id = req.user.id;
  const friend_id = req.params.friend_id;
  const { status } = req.body;

  if (!friend_id || String(friend_id).trim() === '') {
    return res.status(400).json({ error: 'friend_id is required.' });
  }

  if (!status || !ALLOWED_INVITE_RESPONSES.includes(status)) {
    return res.status(400).json({
      error: `status is required and must be one of: ${ALLOWED_INVITE_RESPONSES.join(', ')}.`,
    });
  }

  try {
    const contactName = status === 'accepted' ? storedContactName(req.body?.contact_name) : null;
    await db.query('CALL respond_to_circle_invite($1, $2, $3)', [
      user_id,
      friend_id,
      status,
    ]);
    await saveContactName(user_id, friend_id, contactName);
    res.json({ message: `Invite ${status}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/circle
// List circle members and pending invites (includes is_sender and contact_name)
const getCircle = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_circle($1) AS result',
      [user_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/circle/:friend_id/cards
// Shared cards from an accepted circle friend (for creating a request)
const getCircleCards = async (req, res) => {
  const user_id = req.user.id;
  const friend_id = req.params.friend_id;

  if (!friend_id || String(friend_id).trim() === '') {
    return res.status(400).json({ error: 'friend_id is required.' });
  }

  if (friend_id === user_id) {
    return res.status(400).json({ error: 'You cannot view your own cards through circle.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT get_circle_cards($1, $2) AS result',
      [user_id, friend_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/circle/invite/:friend_id
// Sender withdraws an invite that is still pending
const cancelInvite = async (req, res) => {
  const user_id = req.user.id;
  const friend_id = req.params.friend_id;

  if (!friend_id || String(friend_id).trim() === '') {
    return res.status(400).json({ error: 'friend_id is required.' });
  }

  if (friend_id === user_id) {
    return res.status(400).json({ error: 'You cannot cancel an invite to yourself.' });
  }

  try {
    await db.query('CALL cancel_circle_invite($1, $2)', [user_id, friend_id]);
    res.json({ message: 'Invite cancelled.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/circle/:friend_id
// Remove a friend from circle — blocked if an active order exists
const removeFromCircle = async (req, res) => {
  const user_id = req.user.id;
  const friend_id = req.params.friend_id;

  if (!friend_id || String(friend_id).trim() === '') {
    return res.status(400).json({ error: 'friend_id is required.' });
  }

  if (friend_id === user_id) {
    return res.status(400).json({ error: 'You cannot remove yourself from your circle.' });
  }

  try {
    await db.query('CALL remove_from_circle($1, $2)', [user_id, friend_id]);
    res.json({ message: 'Removed from circle.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  sendInvite,
  respondToInvite,
  cancelInvite,
  getCircle,
  getCircleCards,
  removeFromCircle,
};
