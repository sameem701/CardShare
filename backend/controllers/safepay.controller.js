const db = require('../config/db');

const ESCROW_SUCCESS_EVENTS = new Set([
  'payment.succeeded',
  'payment:created',
  'transaction.captured', // dev / manual curl
]);

const isTrackToken = (value) => typeof value === 'string' && value.trim().startsWith('track_');

const pickRequestId = (body) => {
  const candidates = [
    body?.data?.metadata?.order_id,
    body?.data?.metadata?.request_id,
    body?.notification?.metadata?.order_id,
    body?.notification?.metadata?.request_id,
    body?.metadata?.order_id,
    body?.metadata?.request_id,
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }

  return null;
};

const pickPspHoldId = (body) => {
  const candidates = [
    body?.notification?.tracker,
    body?.data?.tracker?.token,
    body?.data?.tracker,
    body?.tracker,
    isTrackToken(body?.data?.token) ? body.data.token : null,
    isTrackToken(body?.token) ? body.token : null,
  ];

  for (const candidate of candidates) {
    if (candidate && isTrackToken(String(candidate))) {
      return String(candidate).trim();
    }
  }

  return null;
};

const isEscrowLockEvent = (body) => {
  const type = body?.type;
  if (!type || !ESCROW_SUCCESS_EVENTS.has(type)) {
    return false;
  }

  const state = body?.notification?.state ?? body?.data?.state;
  if (state && String(state).toUpperCase() !== 'PAID') {
    return false;
  }

  return true;
};

// POST /api/webhooks/safepay
const escrowWebhookHandler = async (req, res) => {
  const body = req.body ?? {};

  console.log('[Safepay webhook]', JSON.stringify({
    type: body.type,
    has_notification: Boolean(body.notification),
    has_data: Boolean(body.data),
  }));

  if (!isEscrowLockEvent(body)) {
    return res.status(200).json({ message: 'Event ignored', type: body.type ?? null });
  }

  const request_id = pickRequestId(body);
  const psp_hold_id = pickPspHoldId(body);

  if (!request_id || !psp_hold_id) {
    console.warn('[Safepay webhook] Missing order/tracker fields:', JSON.stringify(body));
    return res.status(400).json({ error: 'Missing required tracking data from PSP.' });
  }

  try {
    const { rows: requestRows } = await db.query(
      'SELECT requester_id, rq_status, psp_hold_id FROM requests WHERE id = $1',
      [request_id]
    );

    if (!requestRows.length) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const request = requestRows[0];

    if (request.rq_status === 'escrow_locked') {
      return res.status(200).json({
        message: 'Escrow already locked.',
        rq_status: 'escrow_locked',
        psp_hold_id: request.psp_hold_id,
      });
    }

    const { rows } = await db.query(
      'SELECT lock_escrow($1, $2, $3) AS result',
      [request_id, request.requester_id, psp_hold_id]
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
