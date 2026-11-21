const db = require('../config/db');

// GET /api/profile
// Logged-in user: id, phone, display_name, city, created_at.
// A null display_name means the name is not set.
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

// GET /api/profile/stats
// { holder: { earned_all, earned_month, orders_all, orders_month },
//   requester: { saved_all, saved_month, orders_all, orders_month } }
const getStats = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT get_user_stats($1) AS result',
      [req.user.id]
    );
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

    // An account that has not finished setup has no name yet, so it cannot be invited.
    const found = rows[0].result;
    if (!found || !found.display_name || String(found.display_name).trim() === '') {
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

module.exports = { getProfile, getStats, findUserByPhone };
