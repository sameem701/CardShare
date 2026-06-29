const db = require('../config/db');
const { validateScreenshotUrl } = require('../utils/screenshotUrl');

// GET /api/orders/incoming
// Ahmed sees all pending requests waiting for his accept/decline
const getIncomingRequests = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_incoming_requests($1) AS result',
      [holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/orders/:id/accept
// Ahmed accepts a pending request — moves to payment_pending (fees set at submit_tracking)
const acceptRequest = async (req, res) => {
  const holder_id  = req.user.id;
  const request_id = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT accept_request($1,$2) AS result',
      [request_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/orders/:id/decline
// Ahmed declines a pending request — request is deleted, Sara is freed
const declineRequest = async (req, res) => {
  const holder_id  = req.user.id;
  const request_id = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT decline_request($1,$2) AS result',
      [request_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/orders/:id
// Ahmed cancels an order he already accepted — only from escrow_locked
// Sara is refunded in full, sealed transaction created with status cancelled
const cancelOrder = async (req, res) => {
  const holder_id  = req.user.id;
  const request_id = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT cancel_request_holder($1,$2) AS result',
      [request_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/orders/:id/tracking
// Ahmed submits screenshot + actual checkout amount after placing the order
// Requires: screenshot_url, actual_amount_paid (integer PKR, 0 < amount <= order_amount)
const submitTracking = async (req, res) => {
  const holder_id  = req.user.id;
  const request_id = req.params.id;
  const { screenshot_url, actual_amount_paid } = req.body;

  if (!screenshot_url || screenshot_url.trim() === '') {
    return res.status(400).json({ error: 'screenshot_url is required.' });
  }

  const urlCheck = validateScreenshotUrl(screenshot_url);
  if (!urlCheck.ok) {
    return res.status(400).json({ error: urlCheck.error });
  }

  const amount = Number(actual_amount_paid);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'actual_amount_paid must be a positive integer (PKR).' });
  }

  try {
    const { rows } = await db.query(
      'SELECT submit_tracking($1,$2,$3,$4) AS result',
      [request_id, holder_id, urlCheck.url, amount]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/orders
// Ahmed's currently active orders (payment_pending, escrow_locked, tracking_submitted)
const getActiveOrders = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_active_orders_holder($1) AS result',
      [holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/orders/:id
// Ahmed views full detail of a single active order
const getOrder = async (req, res) => {
  const holder_id  = req.user.id;
  const request_id = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT get_request_holder($1,$2) AS result',
      [request_id, holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/orders/history
// Ahmed's full history of finalised orders
const getTransactionHistory = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_transaction_history_holder($1) AS result',
      [holder_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getIncomingRequests,
  acceptRequest,
  declineRequest,
  cancelOrder,
  submitTracking,
  getActiveOrders,
  getOrder,
  getTransactionHistory,
};
