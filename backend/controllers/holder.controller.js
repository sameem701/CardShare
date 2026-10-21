const db = require('../config/db');
const { isSupabaseConfigured } = require('../config/supabase');
const { validateScreenshotPath } = require('../utils/screenshotPath');
const {
  createScreenshotUploadSlot,
  attachSignedScreenshotUrl,
  verifyScreenshotFile,
} = require('../utils/screenshotStorage');
const { unreadCountMap, withUnreadCounts } = require('../utils/unreadCounts');

const MIN_ORDER_AMOUNT_PKR = 100;

const requireId = (req, res, label) => {
  const id = req.params.id;
  if (!id || String(id).trim() === '') {
    res.status(400).json({ error: `${label} is required.` });
    return null;
  }
  return id;
};

const withSignedScreenshots = async (records) => {
  if (!Array.isArray(records)) {
    return attachSignedScreenshotUrl(records);
  }
  return Promise.all(records.map((record) => attachSignedScreenshotUrl(record)));
};

const assertAcceptedOrder = async (order_id, holder_id) => {
  const { rows } = await db.query(
    `SELECT rq_status FROM requests
     WHERE id = $1 AND card_holder_id = $2`,
    [order_id, holder_id]
  );

  if (!rows.length) {
    throw new Error('Request not found or access denied.');
  }

  if (rows[0].rq_status !== 'accepted') {
    throw new Error('Screenshot upload is only available after the request is accepted.');
  }
};

// GET /api/holder/incoming
// Pending requests. The address is not included.
const getIncomingRequests = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_incoming_requests($1) AS result',
      [holder_id]
    );
    const counts = await unreadCountMap(holder_id);
    res.json(withUnreadCounts(rows[0].result ?? [], counts));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/holder/orders
// accepted and proof_submitted. The address is included.
const getActiveOrders = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_active_orders_holder($1) AS result',
      [holder_id]
    );
    const orders = await withSignedScreenshots(rows[0].result ?? []);
    const counts = await unreadCountMap(holder_id);
    res.json(withUnreadCounts(orders, counts));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/holder/orders/:id
// Address is present only when the status is accepted or proof_submitted.
const getOrder = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireId(req, res, 'Order id');
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
// pending becomes accepted.
const acceptRequest = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireId(req, res, 'Order id');
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
// Deletes a pending request.
const declineRequest = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireId(req, res, 'Order id');
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
// Accepted only. A reason is required. Writes cancelled_by_holder.
const cancelOrder = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireId(req, res, 'Order id');
  if (!order_id) return;

  const reason = req.body?.reason;
  if (!reason || String(reason).trim() === '') {
    return res.status(400).json({ error: 'A reason is required to cancel.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT cancel_request_holder($1, $2, $3) AS result',
      [order_id, holder_id, String(reason).trim()]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/orders/:id/screenshot/upload-url
// Upload slot while the request is accepted.
const getScreenshotUploadUrl = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireId(req, res, 'Order id');
  if (!order_id) return;

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Screenshot storage is not configured.' });
  }

  try {
    await assertAcceptedOrder(order_id, holder_id);
    const upload = await createScreenshotUploadSlot(order_id, req.body?.extension);
    res.status(201).json(upload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/orders/:id/proof
// accepted becomes proof_submitted.
// order_amount is the price without the card. The form prefills Sara's figure
// and Ahmed may correct it here, together with the card charge.
const submitProof = async (req, res) => {
  const holder_id = req.user.id;
  const order_id = requireId(req, res, 'Order id');
  if (!order_id) return;

  const { screenshot_url, order_amount, actual_amount_paid } = req.body;

  const pathCheck = validateScreenshotPath(screenshot_url, order_id);
  if (!pathCheck.ok) {
    return res.status(400).json({ error: pathCheck.error });
  }

  const original = Number(order_amount);
  if (!Number.isInteger(original) || original <= MIN_ORDER_AMOUNT_PKR) {
    return res.status(400).json({
      error: `order_amount must be a whole number greater than ${MIN_ORDER_AMOUNT_PKR} PKR.`,
    });
  }

  const amount = Number(actual_amount_paid);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({
      error: 'actual_amount_paid must be a positive whole number (PKR).',
    });
  }

  if (amount > original) {
    return res.status(400).json({
      error: 'actual_amount_paid cannot exceed the order amount.',
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
      'SELECT submit_proof($1, $2, $3, $4, $5) AS result',
      [order_id, holder_id, pathCheck.path, original, amount]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/holder/history
// unpaid, paid, cancelled_by_requester, cancelled_by_holder. No delivery address.
// Includes card_id when the transaction was stored with one.
const getTransactionHistory = async (req, res) => {
  const holder_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_transaction_history_holder($1) AS result',
      [holder_id]
    );
    res.json(await withSignedScreenshots(rows[0].result ?? []));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/holder/transactions/:id/confirm-paid
// unpaid becomes paid.
const confirmPaid = async (req, res) => {
  const holder_id = req.user.id;
  const txn_id = requireId(req, res, 'Transaction id');
  if (!txn_id) return;

  try {
    const { rows } = await db.query(
      'SELECT confirm_paid($1, $2) AS result',
      [txn_id, holder_id]
    );
    res.json(rows[0].result);
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
  submitProof,
  getTransactionHistory,
  confirmPaid,
};
