const jwt = require('jsonwebtoken');
const db  = require('../config/db');
const { getDeviceId } = require('../utils/requestDevice');

const validateActiveSession = async (session_id, user_id, deviceId) => {
  const { rows } = await db.query(
    `SELECT 1 FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.user_id = $2 AND u.device_id = $3`,
    [session_id, user_id, deviceId]
  );
  return rows.length > 0;
};

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  const deviceId = getDeviceId(req);

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  if (!deviceId) {
    return res.status(401).json({ error: 'X-Device-Id header is required.' });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { session_id, user_id } = payload;

    if (!session_id || !user_id) {
      return res.status(401).json({ error: 'Session invalid. Please log in again.' });
    }

    const valid = await validateActiveSession(session_id, user_id, deviceId);
    if (!valid) {
      return res.status(401).json({ error: 'Session revoked. Please log in again.' });
    }

    req.user = { id: user_id, session_id };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access token expired.',
        code: 'ACCESS_EXPIRED',
      });
    }

    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = auth;
module.exports.validateActiveSession = validateActiveSession;
