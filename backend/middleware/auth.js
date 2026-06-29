const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const auth = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.device_id) {
      return res.status(401).json({ error: 'Session invalid. Please log in again.' });
    }

    const { rows } = await db.query(
      'SELECT device_id FROM users WHERE id = $1',
      [payload.id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Unauthorised.' });
    }

    const dbDeviceId = rows[0].device_id;

    if (dbDeviceId !== payload.device_id) {
      return res.status(401).json({ error: 'Session revoked. Please log in again.' });
    }

    req.user = payload;
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
