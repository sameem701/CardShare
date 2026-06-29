const db = require('../config/db');

// All amounts in this app are whole PKR (Pakistani Rupees), not paisa.
// e.g. 5000 means Rs 5,000. Stored as INT in the database.

const maxFakeWalletAmount = () => {
  const raw = process.env.FAKE_WALLET_MAX_AMOUNT;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const validateAmount = (amount, res) => {
  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be a positive integer (PKR).' });
    return false;
  }

  const cap = maxFakeWalletAmount();
  if (cap !== null && amount > cap) {
    res.status(400).json({ error: `amount must not exceed ${cap}.` });
    return false;
  }

  return true;
};

// POST /api/wallet/topup
// MVP test only — adds fake balance. Disabled unless fake wallet middleware allows.
const topUp = async (req, res) => {
  const user_id = req.user.id;
  const { amount } = req.body;

  if (!validateAmount(amount, res)) return;

  try {
    await db.query('CALL top_up_wallet($1, $2)', [user_id, amount]);
    res.json({ message: `Wallet topped up by ${amount}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/wallet/withdraw
// MVP test only — deducts fake balance (simulates payout). Same gate as topup.
const withdraw = async (req, res) => {
  const user_id = req.user.id;
  const { amount } = req.body;

  if (!validateAmount(amount, res)) return;

  try {
    const { rows } = await db.query(
      'SELECT withdraw_from_wallet($1, $2) AS result',
      [user_id, amount]
    );
    res.json(rows[0].result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

module.exports = { topUp, withdraw };
