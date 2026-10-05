const db = require('../config/db');

const requireField = (value, name) => {
  if (!value || String(value).trim() === '') {
    return `${name} is required.`;
  }
  return null;
};

// POST /api/psp/dev/escrow/locked
// Simulates Sara paid — moves payment_pending → escrow_locked
const escrowLocked = async (req, res) => {
  const { request_id, psp_hold_id } = req.body;

  const requestError = requireField(request_id, 'request_id');
  if (requestError) return res.status(400).json({ error: requestError });

  const holdError = requireField(psp_hold_id, 'psp_hold_id');
  if (holdError) return res.status(400).json({ error: holdError });

  try {
    const { rows: requestRows } = await db.query(
      'SELECT requester_id FROM requests WHERE id = $1',
      [request_id]
    );

    if (!requestRows.length) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const { rows } = await db.query(
      'SELECT lock_escrow($1, $2, $3) AS result',
      [request_id, requestRows[0].requester_id, String(psp_hold_id).trim()]
    );

    res.json({
      message: 'Escrow locked.',
      ...rows[0].result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  escrowLocked,
};
