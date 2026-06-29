const db = require('../config/db');

// GET /api/profile
// Returns the logged-in user's profile including wallet balance
const getProfile = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_profile($1) AS result',
      [user_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { getProfile };
