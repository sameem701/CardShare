// Unit tests — no database needed.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const randKey = () => crypto.randomBytes(32).toString('hex');

// Snapshot/restore env so tests don't leak into each other
const ENV_KEYS = [
  'PAYOUT_VAULT_KEY', 'PAYOUT_VAULT_KEY_V2', 'PAYOUT_VAULT_KEY_VERSION',
  'NODE_ENV', 'ALLOW_MOCK_PAYOUT_VERIFY',
];
const saved = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
const restoreEnv = () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
};
test.beforeEach(() => {
  restoreEnv();
  process.env.PAYOUT_VAULT_KEY = randKey();
  delete process.env.PAYOUT_VAULT_KEY_V2;
  delete process.env.PAYOUT_VAULT_KEY_VERSION;
});
test.after(restoreEnv);

const vault = require('../utils/payoutVault');
const { normalizeDetails, saveDestination, PayoutError } = require('../services/payout.service');

const payload = { account_number: 'PK36MEZN0000001234567890', account_title: 'Ahmed Ali' };

test('encrypt/decrypt round trip', () => {
  const row = vault.encrypt(payload, 'user-1');
  assert.deepEqual(vault.decrypt(row, 'user-1'), payload);
});

test('ciphertext never contains the plaintext account number', () => {
  const row = vault.encrypt(payload, 'user-1');
  const blob = JSON.stringify(row);
  assert.ok(!blob.includes(payload.account_number));
  assert.ok(!blob.includes('Ahmed'));
});

test('fresh IV and ciphertext on every encryption of the same data', () => {
  const a = vault.encrypt(payload, 'user-1');
  const b = vault.encrypt(payload, 'user-1');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('another user id fails to decrypt (AAD binding)', () => {
  const row = vault.encrypt(payload, 'user-1');
  assert.throws(() => vault.decrypt(row, 'user-2'));
});

test('tampered ciphertext fails', () => {
  const row = vault.encrypt(payload, 'user-1');
  const buf = Buffer.from(row.ciphertext, 'base64');
  buf[0] ^= 1;
  assert.throws(() => vault.decrypt({ ...row, ciphertext: buf.toString('base64') }, 'user-1'));
});

test('tampered auth tag fails', () => {
  const row = vault.encrypt(payload, 'user-1');
  const tag = Buffer.from(row.auth_tag, 'base64');
  tag[0] ^= 1;
  assert.throws(() => vault.decrypt({ ...row, auth_tag: tag.toString('base64') }, 'user-1'));
});

test('tampered IV fails', () => {
  const row = vault.encrypt(payload, 'user-1');
  const iv = Buffer.from(row.iv, 'base64');
  iv[0] ^= 1;
  assert.throws(() => vault.decrypt({ ...row, iv: iv.toString('base64') }, 'user-1'));
});

test('wrong key fails', () => {
  const row = vault.encrypt(payload, 'user-1');
  process.env.PAYOUT_VAULT_KEY = randKey();
  assert.throws(() => vault.decrypt(row, 'user-1'));
});

test('startup check rejects missing, short and non-hex keys', () => {
  delete process.env.PAYOUT_VAULT_KEY;
  assert.throws(() => vault.assertConfigured());
  process.env.PAYOUT_VAULT_KEY = 'abcd';
  assert.throws(() => vault.assertConfigured());
  process.env.PAYOUT_VAULT_KEY = 'z'.repeat(64);
  assert.throws(() => vault.assertConfigured());
  process.env.PAYOUT_VAULT_KEY = randKey();
  assert.doesNotThrow(() => vault.assertConfigured());
});

test('key rotation: old rows still decrypt after moving to a new key version', () => {
  const oldRow = vault.encrypt(payload, 'user-1');
  assert.equal(oldRow.key_version, 1);

  process.env.PAYOUT_VAULT_KEY_V2 = randKey();
  process.env.PAYOUT_VAULT_KEY_VERSION = '2';

  const newRow = vault.encrypt(payload, 'user-1');
  assert.equal(newRow.key_version, 2);
  assert.deepEqual(vault.decrypt(oldRow, 'user-1'), payload);
  assert.deepEqual(vault.decrypt(newRow, 'user-1'), payload);
});

test('normalizeDetails accepts any provider and strips spaces/dashes', () => {
  const out = normalizeDetails({
    channel: 'NayaPay',
    account_number: '0300 123-4567',
    account_title: 'Ahmed   Ali',
  });
  assert.equal(out.channel, 'NayaPay');
  assert.equal(out.account_number, '03001234567');
  assert.equal(out.account_title, 'Ahmed Ali');
});

test('normalizeDetails rejects bad shapes', () => {
  const good = { channel: 'HBL', account_number: 'PK36MEZN0000001234567890', account_title: 'Ahmed Ali' };
  assert.doesNotThrow(() => normalizeDetails(good));
  assert.throws(() => normalizeDetails({ ...good, channel: '' }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, channel: 'x'.repeat(51) }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, account_number: '123' }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, account_number: 'A'.repeat(35) }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, account_number: "12345'; DROP" }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, account_title: 'A' }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, account_title: 'Ahmed<script>' }), PayoutError);
  assert.throws(() => normalizeDetails({ ...good, bank_name: 'x'.repeat(101) }), PayoutError);
});

test('production refuses the mock verify unless explicitly allowed (before touching the DB)', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_MOCK_PAYOUT_VERIFY;

  await assert.rejects(
    () => saveDestination('user-1', {
      channel: 'HBL',
      account_number: 'PK36MEZN0000001234567890',
      account_title: 'Ahmed Ali',
    }),
    (err) => err instanceof PayoutError && err.status === 503
  );
});
