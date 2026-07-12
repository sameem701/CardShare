const db = require('../config/db');
const bcrypt = require('bcryptjs');

const normalizeSecurityAnswer = (answer) => answer.trim().toLowerCase();

// Step 1 — POST /api/onboarding/profile
// Sets display name (phone already set at OTP verify)
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

// Step 2 — POST /api/onboarding/pin
// 6-digit PIN — hashed in Node before store
const upsertPin = async (req, res) => {
  const { pin } = req.body;
  const user_id = req.user.id;

  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
  }

  try {
    const pin_hash = await bcrypt.hash(pin, 10);
    await db.query('CALL upsert_pin($1, $2)', [user_id, pin_hash]);
    res.json({ message: 'PIN set successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Step 3 — POST /api/onboarding/security
// Security question + bcrypt-hashed answer (forgot PIN on known device)
const setSecurityQuestion = async (req, res) => {
  const { security_question, security_answer } = req.body;
  const user_id = req.user.id;

  if (!security_question ) {
    return res.status(400).json({ error: 'Security question is required.' });
  }

  if (!security_answer || normalizeSecurityAnswer(security_answer).length < 2) {
    return res.status(400).json({ error: 'Security answer must be at least 2 characters.' });
  }

  try {
    const answer_hash = await bcrypt.hash(normalizeSecurityAnswer(security_answer), 10);
    await db.query(
      'CALL upsert_security_question($1, $2, $3)',
      [user_id, security_question.trim(), answer_hash]
    );
    res.json({ message: 'Security question saved.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Step 4 — POST /api/onboarding/complete
// Requires profile + PIN + security question; sets is_onboarded = 1
const completeOnboarding = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT complete_onboarding($1) AS result',
      [user_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  updateProfile,
  upsertPin,
  setSecurityQuestion,
  completeOnboarding,
};
