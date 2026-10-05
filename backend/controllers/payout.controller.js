const payout = require('../services/payout.service');

// NOTE: never log req.body in this file — it carries account details.

const handleError = (err, res) => {
  if (err instanceof payout.PayoutError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Database RAISE messages (e.g. active-order guard) are safe, user-facing text.
  if (err && err.code === 'P0001') {
    return res.status(400).json({ error: err.message });
  }
  console.error('Payout request failed:', err && err.name);
  return res.status(500).json({ error: 'Failed to process payout request.' });
};

// PUT /api/payout
// Link or replace the holder's payout destination
const linkPayout = async (req, res) => {
  try {
    const result = await payout.saveDestination(req.user.id, req.body || {});
    res.json({ message: 'Payout account linked.', payout: result });
  } catch (err) {
    handleError(err, res);
  }
};

// GET /api/payout
// Masked status only — never ciphertext or account numbers
const getPayout = async (req, res) => {
  try {
    const result = await payout.getPublicState(req.user.id);
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

// DELETE /api/payout
const removePayout = async (req, res) => {
  try {
    await payout.removeDestination(req.user.id);
    res.json({ message: 'Payout account removed.' });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = { linkPayout, getPayout, removePayout };
