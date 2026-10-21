const db = require('../config/db');

// Counts are for Accepted and Proof sent only. Any other order gets 0.
async function unreadCountMap(userId) {
  const { rows } = await db.query(
    'SELECT get_request_unread_counts($1) AS result',
    [userId]
  );
  const counts = new Map();
  for (const row of rows[0].result ?? []) {
    counts.set(row.request_id, Number(row.unread_count) || 0);
  }
  return counts;
}

function withUnreadCounts(records, counts) {
  return (records ?? []).map((record) => ({
    ...record,
    unread_count: counts.get(record.id) || 0,
  }));
}

module.exports = { unreadCountMap, withUnreadCounts };
