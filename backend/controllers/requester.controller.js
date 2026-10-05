const db = require('../config/db');
const { attachSignedScreenshotUrl } = require('../utils/screenshotStorage');

const MIN_ORDER_AMOUNT_PKR = 100;

const requireRequestId = (req, res) => {
  const request_id = req.params.id;
  if (!request_id || String(request_id).trim() === '') {
    res.status(400).json({ error: 'Request id is required.' });
    return null;
  }
  return request_id;
};

// POST /api/requester/requests
// Sara creates a request against a circle friend's shared card
const createRequest = async (req, res) => {
  const requester_id = req.user.id;
  const {
    card_holder_id,
    card_id,
    merchant,
    product_url,
    delivery_address,
    order_amount,
    discount_percentage,
    note,
  } = req.body;

  if (!card_holder_id || String(card_holder_id).trim() === '') {
    return res.status(400).json({ error: 'card_holder_id is required.' });
  }
  if (!card_id || String(card_id).trim() === '') {
    return res.status(400).json({ error: 'card_id is required.' });
  }
  if (!merchant || String(merchant).trim() === '') {
    return res.status(400).json({ error: 'merchant is required.' });
  }
  if (!delivery_address || String(delivery_address).trim() === '') {
    return res.status(400).json({ error: 'delivery_address is required.' });
  }

  const amount = Number(order_amount);
  if (!Number.isInteger(amount) || amount <= MIN_ORDER_AMOUNT_PKR) {
    return res.status(400).json({
      error: `order_amount must be a whole number greater than ${MIN_ORDER_AMOUNT_PKR} PKR.`,
    });
  }

  const discount = discount_percentage === undefined || discount_percentage === null
    ? 0
    : Number(discount_percentage);

  if (!Number.isInteger(discount) || discount < 0 || discount > 100) {
    return res.status(400).json({ error: 'discount_percentage must be an integer between 0 and 100.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT create_request($1, $2, $3, $4, $5, $6, $7, $8, $9) AS result`,
      [
        requester_id,
        card_holder_id,
        card_id,
        String(merchant).trim(),
        product_url ? String(product_url).trim() : null,
        String(delivery_address).trim(),
        amount,
        discount,
        note ? String(note).trim() : null,
      ]
    );
    res.status(201).json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/requests
// Sara's active orders
const getActiveRequests = async (req, res) => {
  const requester_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_active_requests_requester($1) AS result',
      [requester_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/requests/:id
// Single active request detail
const getRequest = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      'SELECT get_request_requester($1, $2) AS result',
      [request_id, requester_id]
    );
    res.json(await attachSignedScreenshotUrl(rows[0].result));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/requester/requests/:id
// Cancel before escrow locks (pending or payment_pending)
const cancelRequest = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      'SELECT cancel_request($1, $2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requester/requests/:id/pay
// Requester starts PSP checkout (Swich integration pending)
const initiatePay = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      `SELECT id, order_amount, rq_status
       FROM requests
       WHERE id = $1 AND requester_id = $2`,
      [request_id, requester_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Request not found or access denied.' });
    }

    const request = rows[0];
    if (request.rq_status !== 'payment_pending') {
      return res.status(400).json({
        error: 'Payment can only be started when the order is awaiting payment.',
      });
    }

    return res.status(503).json({
      error: 'Payment checkout is not configured yet. Swich integration pending.',
      code: 'PSP_NOT_CONFIGURED',
      request_id,
      order_amount: request.order_amount,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to initiate payment checkout.' });
  }
};

// POST /api/requester/requests/:id/confirm
// Sara confirms Ahmed's tracking submission
const confirmTracking = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      'SELECT confirm_tracking($1, $2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requester/requests/:id/dispute
// Sara disputes after tracking submitted
const raiseDispute = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;
  const { reason } = req.body;

  if (!reason || String(reason).trim() === '') {
    return res.status(400).json({ error: 'reason is required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT raise_dispute($1, $2, $3) AS result',
      [request_id, requester_id, String(reason).trim()]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/history
// Completed, disputed, and cancelled past orders
const getTransactionHistory = async (req, res) => {
  const requester_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_transaction_history_requester($1) AS result',
      [requester_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  createRequest,
  getActiveRequests,
  getRequest,
  cancelRequest,
  initiatePay,
  confirmTracking,
  raiseDispute,
  getTransactionHistory,
};
