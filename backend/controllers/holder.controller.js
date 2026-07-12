const db = require('../config/db');
const { isSupabaseConfigured } = require('../config/supabase');
const { validateScreenshotPath } = require('../utils/screenshotPath');
const {
  createScreenshotUploadSlot,
  attachSignedScreenshotUrl,
  verifyScreenshotFile,
} = require('../utils/screenshotStorage');

const requireOrderId = (req, res) => {
  const order_id = req.params.id;
  if (!order_id || String(order_id).trim() === '') {
    res.status(400).json({ error: 'Order id is required.' });
    return null;
  }
  return order_id;
};

const assertEscrowLockedOrder = async (order_id, holder_id) => {
  const { rows } = await db.query(
    `SELECT rq_status FROM requests
     WHERE id = $1 AND card_holder_id = $2`,
    [order_id, holder_id]
  );

  if (!rows.length) {
    throw new Error('Request not found or access denied.');
  }

  if (rows[0].rq_status !== 'escrow_locked') {
    throw new Error('Screenshot upload is only available when escrow is locked.');
  }
};

// GET /api/holder/incoming
// Pending requests waiting for Ahmed to accept or decline
const getIncomingRequests = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_incoming_requests($1) AS result',
      [holder_id]
    );
    res.json(rows[0].result ?? []);   // if rows[0].result is undefined then return null
  } catch (err) {                     // it is a nullish coalesce operator not a null (? : ) operator
    res.status(400).json({ error: err.message });
  }
};

// GET /api/holder/orders
// Active orders after accept (payment_pending through tracking_submitted)
const getActiveOrders = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_active_orders_holder($1) AS result',
      [holder_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/holder/orders/:id
// Single order detail (delivery address hidden until escrow_locked)
const getOrder = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireOrderId(req, res);
  if (!order_id) return;

  try {
    const { rows } = await db.query(
      'SELECT get_request_holder($1, $2) AS result',
      [order_id, holder_id]
    );
    res.json(await attachSignedScreenshotUrl(rows[0].result));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/orders/:id/accept
// Accept pending request → payment_pending
const acceptRequest = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireOrderId(req, res);
  if (!order_id) return;

  try {
    const { rows } = await db.query(
      'SELECT accept_request($1, $2) AS result',
      [order_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/orders/:id/decline
// Decline pending request
const declineRequest = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireOrderId(req, res);
  if (!order_id) return;

  try {
    const { rows } = await db.query(
      'SELECT decline_request($1, $2) AS result',
      [order_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/holder/orders/:id
// Cancel from escrow_locked (after PSP refund webhook)
const cancelOrder = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireOrderId(req, res);
  if (!order_id) return;

  try {
    const { rows } = await db.query(
      'SELECT cancel_request_holder($1, $2) AS result',
      [order_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/orders/:id/screenshot/upload-url
// Presigned upload slot for private Supabase bucket "screenshots"
const getScreenshotUploadUrl = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireOrderId(req, res);
  if (!order_id) return;

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Screenshot storage is not configured.' });
  }

  try {
    await assertEscrowLockedOrder(order_id, holder_id);
    const upload = await createScreenshotUploadSlot(order_id, req.body?.extension);
    res.status(201).json(upload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/orders/:id/tracking
// Submit checkout screenshot + actual amount paid
const submitTracking = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireOrderId(req, res);
  if (!order_id) return;

  const { screenshot_url, actual_amount_paid } = req.body;

  const pathCheck = validateScreenshotPath(screenshot_url, order_id);
  if (!pathCheck.ok) {
    return res.status(400).json({ error: pathCheck.error });
  }

  const amount = Number(actual_amount_paid);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({
      error: 'actual_amount_paid must be a positive whole number (PKR).',
    });
  }

  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({ error: 'Screenshot storage is not configured.' });
    }

    const fileCheck = await verifyScreenshotFile(pathCheck.path);
    if (!fileCheck.ok) {
      return res.status(400).json({ error: fileCheck.error });
    }

    const { rows } = await db.query(
      'SELECT submit_tracking($1, $2, $3, $4) AS result',
      [order_id, holder_id, pathCheck.path, amount]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/holder/history
// Past completed, disputed, and cancelled orders
const getTransactionHistory = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_transaction_history_holder($1) AS result',
      [holder_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getIncomingRequests,
  getActiveOrders,
  getOrder,
  acceptRequest,
  declineRequest,
  cancelOrder,
  getScreenshotUploadUrl,
  submitTracking,
  getTransactionHistory,
};
