const db = require('../config/db');

const validateCardFields = (bank_name, card_tier) => {
  if (!bank_name || String(bank_name).trim() === '') {
    return 'bank_name is required.';
  }
  if (!card_tier || String(card_tier).trim() === '') {
    return 'card_tier is required.';
  }
  return null;
};

// POST /api/cards
// Add a card (bank + tier only — no card number stored)
const addCard = async (req, res) => {
  const user_id = req.user.id;
  const { bank_name, card_tier } = req.body;

  const validationError = validateCardFields(bank_name, card_tier);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    await db.query('CALL add_card($1, $2, $3)', [
      user_id,
      String(bank_name).trim(),
      String(card_tier).trim(),
    ]);
    res.status(201).json({ message: 'Card added.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/cards/banks
// Peekaboo catalog names from the banks table.
const listBanks = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT list_banks() AS result');
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/cards/tiers
const listCardTiers = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT list_card_tiers() AS result');
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/cards
// id, bank_name, card_tier, allow_sharing, created_at
const getCards = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_cards($1) AS result',
      [user_id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/cards/stats
// One row per owned card: card_id, earned, orders, avg_discount (percent)
const getCardStats = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT get_card_stats($1) AS result',
      [req.user.id]
    );
    res.json(rows[0].result ?? []);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/cards/:id/sharing
// Toggle allow_sharing between 0 and 1
const toggleCardSharing = async (req, res) => {
  const user_id = req.user.id;
  const card_id = req.params.id;

  if (!card_id || String(card_id).trim() === '') {
    return res.status(400).json({ error: 'Card id is required.' });
  }

  try {
    await db.query('CALL toggle_card_sharing($1, $2)', [user_id, card_id]);
    res.json({ message: 'Card sharing toggled.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/cards/:id
// Remove a card — blocked if an active request uses it
const deleteCard = async (req, res) => {
  const user_id = req.user.id;
  const card_id = req.params.id;

  if (!card_id || String(card_id).trim() === '') {
    return res.status(400).json({ error: 'Card id is required.' });
  }

  try {
    await db.query('CALL delete_card($1, $2)', [user_id, card_id]);
    res.json({ message: 'Card deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  addCard,
  listBanks,
  listCardTiers,
  getCards,
  getCardStats,
  toggleCardSharing,
  deleteCard,
};
