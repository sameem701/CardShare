const db = require('../config/db');

const ALLOWED_BANKS = [
  'HBL',
  'MCB',
  'UBL',
  'Meezan',
  'Bank Alfalah',
  'Faysal Bank',
  'Standard Chartered',
  'Askari',
  'Silk Bank',
  'Allied Bank',
  'Habib Metro',
  'JS Bank',
  'Soneri Bank',
  'Bank Al Habib',
];

const ALLOWED_CARD_TYPES = ['Visa', 'Mastercard', 'UnionPay', 'PayPak', 'Amex'];

const ALLOWED_CARD_TIERS = [
  'Classic',
  'Gold',
  'Platinum',
  'Titanium',
  'Signature',
  'World',
];

const validateCardFields = (bank_name, card_type, card_tier) => {
  if (!bank_name || String(bank_name).trim() === '') {
    return 'bank_name is required.';
  }
  if (!card_type || String(card_type).trim() === '') {
    return 'card_type is required.';
  }
  if (!card_tier || String(card_tier).trim() === '') {
    return 'card_tier is required.';
  }

  const bank = String(bank_name).trim();
  const type = String(card_type).trim();
  const tier = String(card_tier).trim();

  if (!ALLOWED_BANKS.includes(bank)) {
    return `Invalid bank_name. Allowed: ${ALLOWED_BANKS.join(', ')}.`;
  }
  if (!ALLOWED_CARD_TYPES.includes(type)) {
    return `Invalid card_type. Allowed: ${ALLOWED_CARD_TYPES.join(', ')}.`;
  }
  if (!ALLOWED_CARD_TIERS.includes(tier)) {
    return `Invalid card_tier. Allowed: ${ALLOWED_CARD_TIERS.join(', ')}.`;
  }

  return null;
};

// POST /api/cards
// Add a card (bank + type + tier only — no card number stored)
const addCard = async (req, res) => {
  const user_id = req.user.id;
  const { bank_name, card_type, card_tier } = req.body;

  const validationError = validateCardFields(bank_name, card_type, card_tier);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    await db.query('CALL add_card($1, $2, $3, $4)', [
      user_id,
      String(bank_name).trim(),
      String(card_type).trim(),
      String(card_tier).trim(),
    ]);
    res.status(201).json({ message: 'Card added.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/cards
// List logged-in user's cards (includes allow_sharing + payout_status)
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
  getCards,
  toggleCardSharing,
  deleteCard,
  ALLOWED_BANKS,
  ALLOWED_CARD_TYPES,
  ALLOWED_CARD_TIERS,
};
