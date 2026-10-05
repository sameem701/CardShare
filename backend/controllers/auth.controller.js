const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendWhatsApp } = require('../utils/sms');
const { getDeviceId } = require('../utils/requestDevice');

// Access JWT: { session_id, user_id } only — 5m TTL. No phone or device_id in payload.
// Protected routes: Authorization Bearer + X-Device-Id header.
// Session row + users.device_id checked in auth middleware on every request.

const ACCESS_TTL_MS = 5 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PIN_RESET_TTL_MS = 15 * 60 * 1000;

const normalizeSecurityAnswer = (answer) => answer.trim().toLowerCase();

const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

const generateRefreshToken = () => crypto.randomBytes(32).toString('hex');

const issueToken = (session_id, user_id) => jwt.sign(
  { session_id, user_id },
  process.env.JWT_SECRET,
  { expiresIn: '120m' }
);

const stripSensitiveUserFields = (user) => {
  const {
    pin_hash,
    security_answer_hash,
    device_id: _d,
    ...safeUser
  } = user;
  return safeUser;
};

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

const storeRefreshToken = async (user_id, device_id, plainToken) => {
  const token_hash = sha256(plainToken);
  const expires_at = Date.now() + REFRESH_TTL_MS;

  await db.query(
    'SELECT store_refresh_token($1, $2, $3, $4)',
    [user_id, device_id, token_hash, expires_at]
  );

  return { refresh_token: plainToken, refresh_expires_at: expires_at };
};

const issueAuthResponse = async (user, device_id) => {
  const { rows: sessionRows } = await db.query(
    'SELECT create_session($1) AS result',
    [user.id]
  );
  const session_id = sessionRows[0].result.session_id;

  const token = issueToken(session_id, user.id);
  const refresh = await storeRefreshToken(user.id, device_id, generateRefreshToken());

  return {
    token,
    access_expires_in_ms: ACCESS_TTL_MS,
    ...refresh,
    user: stripSensitiveUserFields(user),
  };
};

// POST /api/auth/status
const getLoginStatus = async (req, res) => {
  const { phone, device_id } = req.body;

  if (!phone || !device_id) {
    return res.status(400).json({ error: 'phone and device_id are required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT get_login_status($1, $2) AS result',
      [phone, device_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
    // await sendWhatsApp(phone, `Your CardCircle OTP is: ${otp}. Valid for 5 minutes.`);
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
  const { phone, otp, device_id } = req.body;

  if (!phone || !otp || !device_id) {
    return res.status(400).json({ error: 'phone, otp and device_id are required.' });
  }

  const otp_hash = sha256(otp);

  try {
    const { rows } = await db.query(
      'SELECT verify_otp($1, $2, $3) AS result',
      [phone, otp_hash, device_id]
    );
    const user = rows[0].result;

    if (Number(user.is_onboarded) === 1) {
      return res.json({
        requires_pin: true,
        user: stripSensitiveUserFields(user),
      });
    }

    res.json(await issueAuthResponse(user, device_id));
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/pin/verify
const verifyPin = async (req, res) => {
  const { phone, pin, device_id } = req.body;

  if (!phone || !pin || !device_id) {
    return res.status(400).json({ error: 'phone, pin and device_id are required.' });
  }

  try {
    await db.query('CALL assert_pin_phone_allowed($1)', [phone]);

    const { rows } = await db.query(
      `SELECT id, phone, display_name, total_saved, total_earned,
              get_payout_state(id) AS payout_status,
              is_onboarded, pin_hash, device_id
       FROM users WHERE phone = $1`,
      [phone]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'User not found.' });
    }

    const user = rows[0];

    if (!user.pin_hash) {
      return res.status(400).json({ error: 'PIN not set. Please complete registration.' });
    }

    if (!user.device_id || user.device_id !== device_id) {
      return res.status(401).json({ error: 'Unrecognised device. Please verify your phone number.' });
    }

    const match = await bcrypt.compare(pin, user.pin_hash);
    if (!match) {
      await db.query('CALL record_pin_fail($1)', [phone]);
      return res.status(401).json({ error: 'Invalid PIN.' });
    }

    await db.query('CALL clear_pin_phone_lockout($1)', [phone]);
    res.json(await issueAuthResponse(user, device_id));
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/forgot-pin/question
const getForgotPinQuestion = async (req, res) => {
  const { phone, device_id } = req.body;

  if (!phone || !device_id) {
    return res.status(400).json({ error: 'phone and device_id are required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT get_forgot_pin_question($1, $2) AS result',
      [phone, device_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/forgot-pin/verify-answer
const verifyForgotPinAnswer = async (req, res) => {
  const { phone, device_id, security_answer } = req.body;

  if (!phone || !device_id || !security_answer) {
    return res.status(400).json({ error: 'phone, device_id and security_answer are required.' });
  }

  try {
    await db.query('CALL assert_security_answer_allowed($1)', [phone]);

    const { rows } = await db.query(
      `SELECT id, device_id, security_answer_hash
       FROM users WHERE phone = $1`,
      [phone]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'User not found.' });
    }

    const user = rows[0];

    if (!user.security_answer_hash) {
      return res.status(400).json({ error: 'Security question not set.' });
    }

    if (!user.device_id || user.device_id !== device_id) {
      return res.status(401).json({ error: 'Unrecognised device. Please verify your phone number.' });
    }

    const match = await bcrypt.compare(
      normalizeSecurityAnswer(security_answer),
      user.security_answer_hash
    );

    if (!match) {
      await db.query('CALL record_security_answer_fail($1)', [phone]);
      return res.status(401).json({ error: 'Incorrect security answer.' });
    }

    await db.query('CALL create_pin_reset_grant($1)', [phone]);

    res.json({
      message: 'Security answer verified. You may reset your PIN within 15 minutes.',
      reset_expires_in_ms: PIN_RESET_TTL_MS,
    });
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/forgot-pin/reset
const resetForgotPin = async (req, res) => {
  const { phone, device_id, pin } = req.body;

  if (!phone || !device_id || !pin) {
    return res.status(400).json({ error: 'phone, device_id and pin are required.' });
  }

  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
  }

  try {
    const pin_hash = await bcrypt.hash(pin, 10);
    await db.query(
      'CALL complete_forgot_pin_reset($1, $2, $3)',
      [phone, device_id, pin_hash]
    );
    res.json({ message: 'PIN reset successful. Please log in with your new PIN.' });
  } catch (err) {
    const mapped = mapAuthLockoutError(err, res);
    if (mapped) return mapped;
    res.status(400).json({ error: err.message });
  }
};

// POST /api/auth/refresh
const refreshToken = async (req, res) => {
  const { refresh_token } = req.body;
  const device_id = getDeviceId(req, { allowBody: true });

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required.' });
  }

  if (!device_id) {
    return res.status(400).json({ error: 'X-Device-Id header is required.' });
  }

  const old_hash = sha256(refresh_token);
  const new_plain = generateRefreshToken();
  const new_hash = sha256(new_plain);
  const expires_at = Date.now() + REFRESH_TTL_MS;

  try {
    const { rows } = await db.query(
      'SELECT rotate_refresh_token($1, $2, $3, $4) AS result',
      [old_hash, new_hash, device_id, expires_at]
    );

    const result = rows[0].result;

    if (!result.session_id) {
      return res.status(401).json({ error: 'Session revoked. Please log in again.' });
    }

    const user = {
      id: result.user_id,
      phone: result.phone,
      display_name: result.display_name,
      total_saved: result.total_saved,
      total_earned: result.total_earned,
      payout_status: result.payout_status,
      is_onboarded: result.is_onboarded,
    };

    res.json({
      token: issueToken(result.session_id, result.user_id),
      access_expires_in_ms: ACCESS_TTL_MS,
      refresh_token: new_plain,
      refresh_expires_at: Number(result.expires_at),
      user: stripSensitiveUserFields({ ...user, device_id: result.device_id }),
    });
  } catch (err) {
    res.status(401).json({ error: err.message });
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
  getLoginStatus,
  sendOtp,
  verifyOtp,
  verifyPin,
  getForgotPinQuestion,
  verifyForgotPinAnswer,
  resetForgotPin,
  refreshToken,
  logout,
  ACCESS_TTL_MS,
  REFRESH_TTL_MS,
};
