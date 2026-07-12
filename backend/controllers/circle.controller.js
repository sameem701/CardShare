const db = require('../config/db');

const ALLOWED_INVITE_RESPONSES = ['accepted', 'declined'];

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
    await db.query('CALL add_to_circle($1, $2)', [user_id, friend_id]);
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
    await db.query('CALL respond_to_circle_invite($1, $2, $3)', [
      user_id,
      friend_id,
      status,
    ]);
    res.json({ message: `Invite ${status}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/circle
// List circle members and pending invites (includes is_sender flag)
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
  getCircle,
  getCircleCards,
  removeFromCircle,
};
