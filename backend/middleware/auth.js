const db = require('../config/db');

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  const userIdHeader = req.headers['x-user-id'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  const sessionId = header.slice('Bearer '.length).trim();
  const userId = userIdHeader ? String(userIdHeader).trim() : '';

  if (!sessionId || !userId) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT validate_session($1, $2) AS result',
      [sessionId, userId]
    );
    const session = rows[0].result;

    req.user = { id: session.user_id, session_id: session.session_id };
    next();
  } catch (err) {
    if (String(err.message || '').includes('Session revoked')) {
      return res.status(401).json({ error: 'Session revoked. Please log in again.' });
    }

    return res.status(401).json({ error: 'Unauthorised.' });
  }
};

module.exports = auth;
