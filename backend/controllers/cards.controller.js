const db = require('../config/db');

// POST /api/cards
// Adds a new card to the logged-in user's account
// Requires: bank_name, card_type, card_tier in body
const addCard = async (req, res) => {
  const { bank_name, card_type, card_tier } = req.body;
  const user_id = req.user.id;

  if (!bank_name || !card_type || !card_tier) {
    return res.status(400).json({ error: 'bank_name, card_type and card_tier are required.' });
  }

  try {
    await db.query(
      'CALL add_card($1, $2, $3, $4)',
      [user_id, bank_name, card_type, card_tier]
    );
    res.status(201).json({ message: 'Card added.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/cards
// Returns all cards belonging to the logged-in user
const getCards = async (req, res) => {
  const user_id = req.user.id;

  try {
    const { rows } = await db.query(
      'SELECT get_cards($1) AS result',
      [user_id]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PATCH /api/cards/:id/sharing
// Toggles allow_sharing on or off for a specific card
const toggleCardSharing = async (req, res) => {
  const user_id = req.user.id;
  const card_id = req.params.id;

  try {
    await db.query(
      'CALL toggle_card_sharing($1, $2)',
      [user_id, card_id]
    );
    res.json({ message: 'Card sharing toggled.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/cards/:id
// Deletes a card — blocked if an active request is using it
const deleteCard = async (req, res) => {
  const user_id = req.user.id;
  const card_id = req.params.id;

  try {
    await db.query(
      'CALL delete_card($1, $2)',
      [user_id, card_id]
    );
    res.json({ message: 'Card deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { addCard, getCards, toggleCardSharing, deleteCard };
