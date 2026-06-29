const db = require('../config/db');

// POST /api/circle/invite
// Send a circle invite to another user by their phone number
// Requires: phone in body (the friend's phone number)
const sendInvite = async (req, res) => {
  const user_id = req.user.id;
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'phone is required.' });
  }

  try {
    // Resolve phone to user_id — the DB procedure works with IDs not phones
    const { rows } = await db.query(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No user found with that phone number.' });
    }

    const friend_id = rows[0].id;

    if (friend_id === user_id) {
      return res.status(400).json({ error: 'You cannot add yourself to your circle.' });
    }

    await db.query('CALL add_to_circle($1, $2)', [user_id, friend_id]);
    res.json({ message: 'Invite sent.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/circle/invite/:friend_id
// Accept or decline a pending circle invite received from friend_id
// Requires: status ('accepted' or 'declined') in body
const respondToInvite = async (req, res) => {
  const user_id   = req.user.id;
  const friend_id = req.params.friend_id;
  const { status } = req.body;

  if (!status || !['accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'status must be accepted or declined.' });
  }

  try {
    await db.query(
      'CALL respond_to_circle_invite($1, $2, $3)',
      [user_id, friend_id, status]
    );
    res.json({ message: `Invite ${status}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/circle/:friend_id
// Remove a user from your circle — blocked if there is an active order between you
const removeFromCircle = async (req, res) => {
  const user_id   = req.user.id;
  const friend_id = req.params.friend_id;

  if (friend_id === user_id) {
    return res.status(400).json({ error: 'You cannot remove yourself from your circle.' });
  }

  try {
    // Verify this person is actually in the circle before attempting removal
    const { rows } = await db.query(
      `SELECT 1 FROM circle
       WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
       AND c_status IN ('pending', 'accepted')`,
      [user_id, friend_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'This user is not in your circle.' });
    }

    await db.query('CALL remove_from_circle($1, $2)', [user_id, friend_id]);
    res.json({ message: 'Removed from circle.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/circle
// Returns all circle members with their status (pending/accepted) and direction (is_sender)
const getCircle = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_circle($1) AS result',
      [user_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/circle/:friend_id/cards
// Returns all cards a circle member has made available for sharing
// Called by Sara when creating a request — she picks which card to use
const getCircleCards = async (req, res) => {
  const user_id   = req.user.id;
  const friend_id = req.params.friend_id;

  try {
    const { rows } = await db.query(
      'SELECT get_circle_cards($1, $2) AS result',
      [user_id, friend_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { sendInvite, respondToInvite, removeFromCircle, getCircle, getCircleCards };
