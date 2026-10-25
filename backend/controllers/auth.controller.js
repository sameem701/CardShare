const db = require('../config/db');
const crypto = require('crypto');

const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

const mapAuthLockoutError = (err, res) => {
  const msg = err.message || '';

  if (msg === 'OTP_CONTACT_SUPPORT') {
    return res.status(403).json({
      error: 'Account locked. Please contact support.',
      code: 'CONTACT_SUPPORT',
    });
  }

  if (msg.startsWith('OTP_LOCKED:')) {
    const blockedUntil = Number(msg.slice('OTP_LOCKED:'.length));
    return res.status(429).json({
      error: 'Too many failed attempts. Try again later.',
      code: 'OTP_LOCKED',
      retry_after_ms: Math.max(0, blockedUntil - Date.now()),
      blocked_until: blockedUntil,
    });
  }

  if (msg.startsWith('OTP_COOLDOWN:')) {
    const retryAfterMs = Number(msg.slice('OTP_COOLDOWN:'.length));
    return res.status(429).json({
      error: 'Please wait before requesting another OTP.',
      code: 'OTP_COOLDOWN',
      retry_after_ms: retryAfterMs,
    });
  }

  return null;
};

const createSession = async (userId) => {
  const { rows } = await db.query(
    'SELECT create_session($1) AS result',
    [userId]
  );
  return rows[0].result.session_id;
};

// POST /api/auth/otp/send
const sendOtp = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otp_hash = sha256(otp);
  const expires_at = Date.now() + 5 * 60 * 1000;

  try {
    await db.query('CALL store_otp($1, $2, $3)', [phone, otp_hash, expires_at]);
    // await sendWhatsApp(phone, `Your CardShare OTP is: ${otp}. Valid for 5 minutes.`);
    console.log(`OTP for ${phone}: ${otp}`);
    res.json({ message: 'OTP sent.' });
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/otp/verify
const verifyOtp = async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: 'phone and otp are required.' });
  }

  const otp_hash = sha256(otp);

  try {
    const { rows } = await db.query(
      'SELECT verify_otp($1, $2) AS result',
      [phone, otp_hash]
    );
    const user = rows[0].result;
    const session_id = await createSession(user.id);

    res.json({
      session_id,
      user: {
        id: user.id,
        phone: user.phone,
        display_name: user.display_name,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    await db.query('CALL logout_user($1)', [req.user.id]);
    res.json({ message: 'Logged out.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  logout,
};
