const db = require('../config/db');
const { attachSignedScreenshotUrl } = require('./screenshotStorage');

const UNPAID_COLUMNS = {
  requester_id: 'requester_id',
  card_holder_id: 'card_holder_id',
};

async function withSignedScreenshots(records) {
  if (!Array.isArray(records)) {
    return attachSignedScreenshotUrl(records);
  }
  return Promise.all(records.map((record) => attachSignedScreenshotUrl(record)));
}

async function listUnpaid(column, userId) {
  const field = UNPAID_COLUMNS[column];
  if (!field) {
    throw new Error('Invalid transaction lookup.');
  }
  const { rows } = await db.query(
    `SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json) AS result
     FROM (
       SELECT id, requester_id, requester_name, card_holder_id, card_holder_name,
              merchant, delivery_address, order_amount, card_id, bank_name, card_tier,
              actual_amount_paid, holder_share, screenshot_url, txn_status,
              cancel_reason, created_at, updated_at
       FROM transactions
       WHERE ${field} = $1 AND txn_status = 'unpaid'
     ) t`,
    [userId]
  );
  return withSignedScreenshots(rows[0].result ?? []);
}

async function getTransactionForUser(txnId, userId) {
  const { rows } = await db.query(
    'SELECT get_transaction($1, $2) AS result',
    [txnId, userId]
  );
  return attachSignedScreenshotUrl(rows[0].result);
}

module.exports = {
  listUnpaid,
  getTransactionForUser,
};
