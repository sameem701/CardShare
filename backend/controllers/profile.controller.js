const db = require('../config/db');

// GET /api/profile
// Logged-in user's profile (stats + payout status for home/settings)
const getProfile = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_profile($1) AS result',
      [user_id]
    );

    if (!rows[0].result) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/profile/find-by-phone
// Lookup another user by phone before sending a circle invite
const findUserByPhone = async (req, res) => {
  const { phone } = req.body;

  if (!phone || String(phone).trim() === '') {
    return res.status(400).json({ error: 'phone is required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT find_user_by_phone($1) AS result',
      [String(phone).trim()]
    );

    if (!rows[0].result) {
      return res.status(404).json({ error: 'No user found with that phone number.' });
    }

    if (rows[0].result.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot add yourself to your circle.' });
    }

    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { getProfile, findUserByPhone };
