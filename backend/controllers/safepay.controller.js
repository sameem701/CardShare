const db = require('../config/db');

// POST /api/webhooks/safepay
const escrowWebhookHandler = async (req, res) => {
  const { type, data } = req.body;

  if (type !== 'transaction.captured') {
    return res.status(200).json({ message: 'Event ignored' });
  }

  const request_id = data?.metadata?.order_id ?? data?.metadata?.request_id;
  const psp_hold_id = data?.token;

  if (!request_id || !psp_hold_id) {
    return res.status(400).json({ error: 'Missing required tracking data from PSP.' });
  }

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

    return res.status(200).json({
      message: 'Escrow locked via Safepay Webhook.',
      ...rows[0].result,
    });
  } catch (err) {
    console.error('Webhook processing failed:', err.message);
    return res.status(500).json({ error: 'Internal server error during webhook processing.' });
  }
};

module.exports = {
  escrowWebhookHandler,
};
