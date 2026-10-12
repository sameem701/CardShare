const db = require('../config/db');

// POST /api/onboarding/profile
// Sets the display name. A saved name means setup is finished.
const updateProfile = async (req, res) => {
  const { display_name } = req.body;
  const user_id = req.user.id;

  if (!display_name || display_name.trim() === '') {
    return res.status(400).json({ error: 'Display name is required.' });
  }

  try {
    await db.query('CALL update_profile($1, $2)', [user_id, display_name.trim()]);
    res.json({ message: 'Profile updated.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  updateProfile,
};
