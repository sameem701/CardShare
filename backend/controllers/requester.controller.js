const db = require('../config/db');
const { normalizeProductUrl } = require('../utils/productUrl');
const { attachSignedScreenshotUrl } = require('../utils/screenshotStorage');
const { unreadCountMap, withUnreadCounts } = require('../utils/unreadCounts');
const { listUnpaid, getTransactionForUser } = require('../utils/transactions');

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

function liveOrderError(err) {
  const body = { error: err.message };
  if (!String(err.message || '').startsWith('You already have a live order with ')) {
    return body;
  }
  if (typeof err.detail !== 'string' || err.detail.trim() === '') return body;
  try {
    const ids = JSON.parse(err.detail);
    if (Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.trim() !== '')) {
      body.holder_ids = ids;
    }
  } catch {
    return body;
  }
  return body;
}

function holdersFromBody(holders) {
  if (!Array.isArray(holders) || holders.length === 0) {
    return { error: 'Choose at least one person.' };
  }
  const cleaned = [];
  const seen = new Set();
  for (const holder of holders) {
    const card_holder_id = holder && String(holder.card_holder_id || '').trim();
    const card_id = holder && String(holder.card_id || '').trim();
    if (!card_holder_id || !card_id) {
      return { error: 'Each person needs a card.' };
    }
    if (seen.has(card_holder_id)) {
      return { error: 'Each person can only be included once.' };
    }
    seen.add(card_holder_id);
    cleaned.push({ card_holder_id, card_id });
  }
  return { holders: cleaned };
}

// POST /api/requester/requests
// One order, one row per selected person, same order_group_id.
// holders: [{ card_holder_id, card_id }]
const createRequest = async (req, res) => {
  const requester_id = req.user.id;
  const {
    holders,
    merchant,
    product_url,
    delivery_address,
    order_amount,
    note,
  } = req.body;

  const parsedHolders = holdersFromBody(holders);
  if (parsedHolders.error) {
    return res.status(400).json({ error: parsedHolders.error });
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
      `SELECT create_request($1, $2, $3, $4, $5, $6, $7::json) AS result`,
      [
        requester_id,
        String(merchant).trim(),
        productLink,
        String(delivery_address).trim(),
        amount,
        note ? String(note).trim() : null,
        JSON.stringify(parsedHolders.holders),
      ]
    );
    res.status(201).json(rows[0].result);
  } catch (err) {
    res.status(400).json(liveOrderError(err));
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
    const request = await attachSignedScreenshotUrl(rows[0].result);
    const counts = await unreadCountMap(requester_id);
    res.json({ ...request, unread_count: counts.get(request.id) || 0 });
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

// GET /api/requester/unpaid
// Orders Sara has accepted that Ahmed has not marked paid.
const getUnpaid = async (req, res) => {
  try {
    res.json(await listUnpaid('requester_id', req.user.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/transactions/:id
const getTransaction = async (req, res) => {
  const txn_id = req.params.id;
  if (!txn_id || String(txn_id).trim() === '') {
    return res.status(400).json({ error: 'Transaction id is required.' });
  }

  try {
    res.json(await getTransactionForUser(txn_id, req.user.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/requester/history
// Paid and cancelled only. Includes delivery_address.
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
  getUnpaid,
  getTransaction,
  getTransactionHistory,
};
