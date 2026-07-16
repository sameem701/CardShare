const db = require('../config/db');

// Generic sandbox endpoints for testing PSP round-trips (PayFast, Alfa, etc.)
// before a specific provider integration is built. Logs whatever the PSP
// sends so you can confirm the flow shape, and optionally advances a real
// request to escrow_locked if a valid request_id is provided via
// custom_str1 / m_payment_id / request_id.

const htmlPage = (title, body) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;">
  <h2>${title}</h2>
  <p>${body}</p>
</body>
</html>`;

// GET/POST /api/psp/sandbox/return
// PSP redirects the buyer's browser here after a completed payment.
// UX only — never trust this alone as proof of payment.
const sandboxReturn = (req, res) => {
  const params = { ...req.query, ...req.body };
  console.log('[psp/sandbox] RETURN hit:', params);
  res.status(200).send(
    htmlPage('Payment received', 'You can return to the CardCircle app now.')
  );
};

// GET/POST /api/psp/sandbox/cancel
// PSP redirects here if the buyer cancels/abandons checkout.
const sandboxCancel = (req, res) => {
  const params = { ...req.query, ...req.body };
  console.log('[psp/sandbox] CANCEL hit:', params);
  res.status(200).send(
    htmlPage('Payment cancelled', 'No charge was made. You can try again in the app.')
  );
};

// POST /api/psp/sandbox/ipn
// Server-to-server notification — this is the real source of truth.
// If a request_id is passed through (custom_str1 / m_payment_id / request_id)
// and matches a real request, advance it to escrow_locked via lock_escrow.
const sandboxIpn = async (req, res) => {
  const params = { ...req.query, ...req.body };
  console.log('[psp/sandbox] IPN received:', params);

  const requestId = params.request_id || params.custom_str1 || params.m_payment_id;
  const holdId =
    params.psp_hold_id || params.pf_payment_id || params.transaction_id || `sandbox_${Date.now()}`;

  if (!requestId) {
    // Nothing to tie this to — acknowledge so the PSP doesn't retry forever.
    return res.status(200).send('OK');
  }

  try {
    const { rows: requestRows } = await db.query(
      'SELECT requester_id FROM requests WHERE id = $1',
      [requestId]
    );

    if (!requestRows.length) {
      console.warn('[psp/sandbox] IPN: request_id not found, ignoring:', requestId);
      return res.status(200).send('OK');
    }

    const { rows } = await db.query(
      'SELECT lock_escrow($1, $2, $3) AS result',
      [requestId, requestRows[0].requester_id, String(holdId).trim()]
    );

    console.log('[psp/sandbox] IPN: escrow locked for', requestId, rows[0].result);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[psp/sandbox] IPN error:', err.message);
    // Still 200 so the PSP doesn't hammer retries over a logic error you can fix later.
    res.status(200).send('OK');
  }
};

module.exports = {
  sandboxReturn,
  sandboxCancel,
  sandboxIpn,
};
