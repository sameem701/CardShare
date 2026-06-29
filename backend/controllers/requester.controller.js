const db = require('../config/db');

// POST /api/requests
// Sara creates a request targeting one of Ahmed's shared cards
// Requires: card_holder_id, card_id, merchant, product_url, delivery_address,
//           order_amount, discount_percentage in body. note is optional.
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
    note = null,
  } = req.body;

  if (!card_holder_id || !card_id || !merchant || !product_url ||
      !delivery_address || !order_amount || discount_percentage === undefined) {
    return res.status(400).json({
      error: 'card_holder_id, card_id, merchant, product_url, delivery_address, order_amount and discount_percentage are required.',
    });
  }

  if (!Number.isInteger(order_amount) || order_amount <= 0) {
    return res.status(400).json({ error: 'order_amount must be a positive integer.' });
  }

  if (!Number.isInteger(discount_percentage) || discount_percentage < 1 || discount_percentage > 99) {
    return res.status(400).json({ error: 'discount_percentage must be an integer between 1 and 99.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT create_request($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',
      [requester_id, card_holder_id, card_id, merchant, product_url,
       delivery_address, order_amount, discount_percentage, note]
    );
    res.status(201).json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/requests/:id
// Sara cancels before payment — pending or payment_pending. Notify Ahmed in app layer if payment_pending.
const cancelRequest = async (req, res) => {
  const requester_id = req.user.id;
  const request_id   = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT cancel_request($1,$2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requests/:id/payment
// Sara confirms payment after Ahmed accepts (pay-on-accept)
// Deducts wallet, locks escrow — must be called within 10 mins of Ahmed accepting
const confirmPayment = async (req, res) => {
  const requester_id = req.user.id;
  const request_id   = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT confirm_payment($1,$2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requests/active
// Sara's current purchase — one active row or null (requester_id only, not holder role)
const getActiveRequest = async (req, res) => {
  const requester_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_request_requester($1) AS result',
      [requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requests/:id/confirm
// Sara confirms the screenshot — pays Ahmed immediately without waiting for the timer
const confirmTracking = async (req, res) => {
  const requester_id = req.user.id;
  const request_id   = req.params.id;

  try {
    const { rows } = await db.query(
      'SELECT confirm_tracking($1,$2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requests/:id/dispute
// Sara raises a dispute within the 30 min window after tracking is submitted
// Requires: reason in body
const raiseDispute = async (req, res) => {
  const requester_id = req.user.id;
  const request_id   = req.params.id;
  const { reason }   = req.body;

  if (!reason || reason.trim() === '') {
    return res.status(400).json({ error: 'A reason is required to raise a dispute.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT raise_dispute($1,$2,$3) AS result',
      [request_id, requester_id, reason.trim()]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/transactions
// Sara's full history of finalised orders (completed, disputed, cancelled, refunded)
const getTransactionHistory = async (req, res) => {
  const requester_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_transaction_history_requester($1) AS result',
      [requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  createRequest,
  cancelRequest,
  confirmPayment,
  getActiveRequest,
  confirmTracking,
  raiseDispute,
  getTransactionHistory,
};
