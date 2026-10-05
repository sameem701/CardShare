const db = require('../config/db');
const { encrypt, decrypt } = require('../utils/payoutVault');

// Holder payout destination service.
// Plaintext account details exist only in memory inside these functions —
// they are never logged and only the encrypted form is stored.
// Swich later replaces verifyDestination (title fetch) and sendPayout (IBFT).

class PayoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PayoutError';
    this.status = status;
  }
}

const CHANNEL_RE = /^[A-Za-z0-9 _.\-]{2,50}$/;
const ACCOUNT_RE = /^[A-Za-z0-9]{6,34}$/;
const TITLE_RE = /^[\p{L}\p{M} .'\-]{2,100}$/u;

// Shape check only: is the input plausible? Whether the account exists is the verify step.
const normalizeDetails = (input) => {
  const channel = String(input.channel || '').trim();
  const bank_name = String(input.bank_name || '').trim();
  const account_number = String(input.account_number || '').replace(/[\s-]/g, '');
  const account_title = String(input.account_title || '').trim().replace(/\s+/g, ' ');

  if (!CHANNEL_RE.test(channel)) {
    throw new PayoutError('A valid payout provider (bank or wallet) is required.');
  }
  if (bank_name.length > 100) {
    throw new PayoutError('bank_name is too long.');
  }
  if (!ACCOUNT_RE.test(account_number)) {
    throw new PayoutError('Account number or IBAN must be 6-34 letters or digits.');
  }
  if (!TITLE_RE.test(account_title)) {
    throw new PayoutError('Account title must be 2-100 characters (letters and spaces).');
  }

  return { channel, bank_name, account_number, account_title };
};

const maskAccount = (account_number) => `****${account_number.slice(-4)}`;

// Verify step. MOCK for now — always passes. Swich title fetch replaces this.
// Refuses to run as a mock in production unless explicitly allowed.
const verifyDestination = async () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const mockAllowed = process.env.ALLOW_MOCK_PAYOUT_VERIFY === 'true';

  if (isProduction && !mockAllowed) {
    throw new PayoutError('Payout verification is not available yet.', 503);
  }

  return { ok: true };
};

// Verify → encrypt → store (pending) → mark verified, in one transaction.
// A failed verify stores nothing, so an existing destination stays untouched.
const saveDestination = async (userId, input) => {
  const details = normalizeDetails(input);

  const verification = await verifyDestination(details);
  if (!verification.ok) {
    throw new PayoutError('Could not verify this account. Check the details and try again.', 422);
  }

  const encrypted = encrypt(
    { account_number: details.account_number, account_title: details.account_title },
    userId
  );

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'CALL save_payout_destination($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        userId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.auth_tag,
        encrypted.key_version,
        details.channel,
        details.bank_name || null,
        maskAccount(details.account_number),
      ]
    );
    await client.query('CALL mark_payout_verified($1)', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return getPublicState(userId);
};

const getPublicState = async (userId) => {
  const { rows } = await db.query('SELECT get_payout_public($1) AS result', [userId]);
  return rows[0].result;
};

const removeDestination = async (userId) => {
  await db.query('CALL remove_payout($1)', [userId]);
};

// Settlement stub (used on confirm once Swich IBFT is wired in).
// Decrypts inside this function only; the Swich call will go here.
const sendPayout = async (userId) => {
  const { rows } = await db.query('SELECT get_payout_ciphertext($1) AS result', [userId]);
  const row = rows[0].result;

  if (!row) {
    throw new PayoutError('Holder has no verified payout account.', 409);
  }

  // eslint-disable-next-line no-unused-vars
  const destination = decrypt(row, userId);

  throw new PayoutError('Payout provider is not integrated yet.', 501);
};

module.exports = {
  PayoutError,
  normalizeDetails,
  saveDestination,
  getPublicState,
  removeDestination,
  sendPayout,
};
