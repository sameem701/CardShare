const db = require('../config/db');
const { normalizeProductUrl } = require('../utils/productUrl');
const { attachSignedScreenshotUrl } = require('../utils/screenshotStorage');
const { unreadCountMap, withUnreadCounts } = require('../utils/unreadCounts');

const MIN_ORDER_AMOUNT_PKR = 100;

const requireRequestId = (req, res) => {
  const request_id = req.params.id;
  if (!request_id || String(request_id).trim() === '') {
    res.status(400).json({ error: 'Request id is required.' });
    return null;
  }
  return request_id;
};

const withSignedScreenshots = async (records) => {
  if (!Array.isArray(records)) {
    return attachSignedScreenshotUrl(records);
  }
  return Promise.all(records.map((record) => attachSignedScreenshotUrl(record)));
};

// POST /api/requester/requests
// Sara creates a pending request against a circle friend's shared card.
const createRequest = async (req, res) => {
  const requester_id = req.user.id;
  const {
    card_holder_id,
    card_id,
    merchant,
    product_url,
    delivery_address,
    order_amount,
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

  let productLink = null;
  try {
    productLink = normalizeProductUrl(product_url);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const { rows } = await db.query(
      `SELECT create_request($1, $2, $3, $4, $5, $6, $7, $8) AS result`,
      [
        requester_id,
        card_holder_id,
        card_id,
        String(merchant).trim(),
        productLink,
        String(delivery_address).trim(),
        amount,
        note ? String(note).trim() : null,
      ]
    );
    res.status(201).json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/requests
// Live requests: pending, accepted, proof_submitted.
const getActiveRequests = async (req, res) => {
  const requester_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_active_requests_requester($1) AS result',
      [requester_id]
    );
    const requests = await withSignedScreenshots(rows[0].result ?? []);
    const counts = await unreadCountMap(requester_id);
    res.json(withUnreadCounts(requests, counts));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/requests/:id
// One live request, including address, product URL, note, and proof.
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
// Pending deletes the request. Accepted requires a reason and writes
// a transaction with status cancelled_by_requester. proof_submitted cannot be cancelled.
const cancelRequest = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  const reason = req.body?.reason;

  try {
    const { rows } = await db.query(
      'SELECT cancel_request($1, $2, $3) AS result',
      [request_id, requester_id, reason == null ? null : String(reason)]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requester/requests/:id/accept-proof
// proof_submitted becomes a transaction with status unpaid.
const acceptProof = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      'SELECT accept_proof($1, $2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/requester/requests/:id/reject-proof
// proof_submitted goes back to accepted so Ahmed can submit again.
const rejectProof = async (req, res) => {
  const requester_id = req.user.id;
  const request_id = requireRequestId(req, res);
  if (!request_id) return;

  try {
    const { rows } = await db.query(
      'SELECT reject_proof($1, $2) AS result',
      [request_id, requester_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/history
// unpaid, paid, cancelled_by_requester, cancelled_by_holder. Includes delivery_address.
// Includes card_id when the transaction was stored with one.
const getTransactionHistory = async (req, res) => {
  const requester_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_transaction_history_requester($1) AS result',
      [requester_id]
    );
    res.json(await withSignedScreenshots(rows[0].result ?? []));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  createRequest,
  getActiveRequests,
  getRequest,
  cancelRequest,
  acceptProof,
  rejectProof,
  getTransactionHistory,
};
