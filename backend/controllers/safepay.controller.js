const db = require('../config/db');

const ESCROW_SUCCESS_EVENTS = new Set([
  'payment.succeeded',
  'payment:created',
  'transaction.captured', // dev / manual curl
]);

const isTrackToken = (value) => typeof value === 'string' && value.trim().startsWith('track_');

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim());

const normalizeString = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
};

const getMetadata = (body) => {
  const raw = body?.data?.metadata ?? body?.notification?.metadata ?? body?.metadata;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
};

const extractTrackerValue = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'object') {
    return normalizeString(value.token ?? value.id ?? value.tracker);
  }
  return null;
};

const pickRequestId = (body) => {
  const metadata = getMetadata(body);
  const candidates = [
    metadata.order_id,
    metadata.orderId,
    metadata.request_id,
    body?.data?.order_id,
    body?.data?.orderId,
    body?.notification?.metadata?.order_id,
    body?.notification?.metadata?.request_id,
    body?.metadata?.order_id,
    body?.metadata?.request_id,
    isUuid(body?.data?.reference) ? body.data.reference : null,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const pickPspHoldId = (body) => {
  const candidates = [
    body?.notification?.tracker,
    body?.data?.tracker,
    body?.data?.payment?.tracker,
    body?.data?.session?.tracker,
    body?.data?.tracker_token,
    body?.data?.token,
    body?.tracker,
    body?.token,
  ];

  for (const candidate of candidates) {
    const extracted = extractTrackerValue(candidate);
    if (extracted && isTrackToken(extracted)) {
      return extracted;
    }
  }

  // Test/sandbox payloads may use non-track_* ids — still store as psp_hold_id.
  for (const candidate of candidates) {
    const extracted = extractTrackerValue(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return null;
};

const isEscrowLockEvent = (body) => {
  const type = body?.type;
  if (!type || !ESCROW_SUCCESS_EVENTS.has(type)) {
    return false;
  }

  if (type === 'payment.succeeded' || type === 'payment:created') {
    return true;
  }

  const state = body?.notification?.state ?? body?.data?.state;
  if (state && String(state).toUpperCase() !== 'PAID') {
    return false;
  }

  return true;
};

const resolveRequestIdFallback = async () => {
  const { rows } = await db.query(
    `SELECT id FROM requests
     WHERE rq_status = 'payment_pending'
     ORDER BY updated_at DESC
     LIMIT 2`
  );

  if (rows.length === 1) {
    console.warn('[Safepay webhook] Using single payment_pending order fallback:', rows[0].id);
    return rows[0].id;
  }

  if (rows.length > 1) {
    console.warn(
      '[Safepay webhook] Multiple payment_pending orders; using most recent:',
      rows[0].id
    );
    return rows[0].id;
  }

  return null;
};

// POST /api/webhooks/safepay
const escrowWebhookHandler = async (req, res) => {
  const body = req.body ?? {};

  console.log('[Safepay webhook]', JSON.stringify({
    type: body.type,
    has_notification: Boolean(body.notification),
    has_data: Boolean(body.data),
    data_keys: body.data && typeof body.data === 'object' ? Object.keys(body.data) : [],
    tracker: extractTrackerValue(body?.data?.tracker),
    order_id: getMetadata(body).order_id ?? null,
  }));

  if (!isEscrowLockEvent(body)) {
    return res.status(200).json({ message: 'Event ignored', type: body.type ?? null });
  }

  let request_id = pickRequestId(body);
  const psp_hold_id = pickPspHoldId(body);

  if (!psp_hold_id) {
    console.warn('[Safepay webhook] Missing tracker. Full body:', JSON.stringify(body));
    return res.status(400).json({ error: 'Missing required tracking data from PSP.' });
  }

  if (!request_id) {
    request_id = await resolveRequestIdFallback();
  }

  if (!request_id) {
    console.warn('[Safepay webhook] Missing order_id. Full body:', JSON.stringify(body));
    return res.status(400).json({ error: 'Missing required tracking data from PSP.' });
  }

  console.log('[Safepay webhook] locking escrow', { request_id, psp_hold_id });

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

    console.log('[Safepay webhook] escrow locked', rows[0].result);

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
