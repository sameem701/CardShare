const crypto = require('crypto');

// AES-256-GCM encryption for holder payout destinations.
// - Key lives only in env (never in the database).
// - Fresh random IV per encryption; IV + auth tag are stored next to the ciphertext.
// - user_id is bound as AAD, so a ciphertext copied to another user's row fails to decrypt.
// - key_version lets us rotate keys: v1 = PAYOUT_VAULT_KEY, vN = PAYOUT_VAULT_KEY_VN.

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_HEX_LENGTH = 64; // 32 bytes

const keyEnvName = (version) => (
  version === 1 ? 'PAYOUT_VAULT_KEY' : `PAYOUT_VAULT_KEY_V${version}`
);

const getCurrentKeyVersion = () => {
  const parsed = Number.parseInt(process.env.PAYOUT_VAULT_KEY_VERSION || '1', 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
};

const loadKey = (version) => {
  const name = keyEnvName(version);
  const hex = process.env[name];

  if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length !== KEY_HEX_LENGTH) {
    throw new Error(`${name} must be set to ${KEY_HEX_LENGTH} hex characters (32 bytes).`);
  }

  return Buffer.from(hex, 'hex');
};

// Call once at startup — fails fast if the current key is missing or malformed.
const assertConfigured = () => {
  loadKey(getCurrentKeyVersion());
};

const aadFor = (userId) => Buffer.from(String(userId), 'utf8');

// payload: plain object (account number + title). Returns fields to store in payout_vault.
const encrypt = (payload, userId) => {
  const key_version = getCurrentKeyVersion();
  const key = loadKey(key_version);
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aadFor(userId));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
    key_version,
  };
};

// row: { ciphertext, iv, auth_tag, key_version } — throws if tampered, wrong key, or wrong user.
const decrypt = (row, userId) => {
  const key = loadKey(Number(row.key_version) || 1);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(row.iv, 'base64')
  );
  decipher.setAAD(aadFor(userId));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));

  const plain = Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(plain.toString('utf8'));
};

module.exports = {
  assertConfigured,
  encrypt,
  decrypt,
  getCurrentKeyVersion,
};
