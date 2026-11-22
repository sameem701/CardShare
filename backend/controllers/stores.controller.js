const db = require('../config/db');

function cityFromQuery(req) {
  const city = String(req.query.city || '').trim();
  return city || 'Karachi';
}

// GET /api/stores?q=&city=
// Offer stores from Peekaboo in that city. Empty q returns the full city list.
const searchStores = async (req, res) => {
  const q = String(req.query.q || '').trim();
  const city = cityFromQuery(req);

  try {
    const { rows } = await db.query(
      'SELECT search_stores($1, $2) AS result',
      [q || null, city]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/stores/:id/apply?amount=&city=
// Ranked circle matches for this store, city, and order amount.
const applyStore = async (req, res) => {
  const storeId = Number(req.params.id);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ error: 'store id must be a positive integer.' });
  }

  const rawAmount = req.query.amount;
  let amount = 10000;
  if (rawAmount !== undefined && String(rawAmount).trim() !== '') {
    amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative integer.' });
    }
  }

  try {
    const { rows } = await db.query(
      'SELECT apply_store($1, $2, $3, $4) AS result',
      [req.user.id, storeId, amount, cityFromQuery(req)]
    );
    res.json(rows[0].result ?? {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/stores/:id/offers?amount=&city=
// Peekaboo catalog for one store, ranked by saving at this order amount.
const listStoreOffers = async (req, res) => {
  const storeId = Number(req.params.id);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ error: 'store id must be a positive integer.' });
  }

  const rawAmount = req.query.amount;
  let amount = 5000;
  if (rawAmount !== undefined && String(rawAmount).trim() !== '') {
    amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative integer.' });
    }
  }

  try {
    const { rows } = await db.query(
      'SELECT list_store_offers($1, $2, $3) AS result',
      [storeId, amount, cityFromQuery(req)]
    );
    res.json(rows[0].result ?? {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/stores/card-preview?bank=&tier=&city=
// Best catalog offer per store for this bank and tier.
const listCardEarnPreview = async (req, res) => {
  const bank = String(req.query.bank || '').trim();
  const tier = String(req.query.tier || '').trim();
  if (!bank || !tier) {
    return res.status(400).json({ error: 'bank and tier are required.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT list_card_earn_preview($1, $2, $3) AS result',
      [bank, tier, cityFromQuery(req)]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  searchStores,
  applyStore,
  listStoreOffers,
  listCardEarnPreview,
};
