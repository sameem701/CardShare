// Integration tests — need a DEV/TEST database with database/db_setup.py already applied.
// Skipped unless TEST_DATABASE_URL is set. NEVER point this at production.
//
//   PowerShell:  $env:TEST_DATABASE_URL="postgresql://..."; npm test
//
// Creates throwaway users (phones starting +99999) and deletes them afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const TEST_URL = process.env.TEST_DATABASE_URL;
const skip = TEST_URL ? false : 'TEST_DATABASE_URL not set';

const ACCOUNT = 'PK36MEZN0000001234567890';
const TITLE = 'Ahmed Ali';
const details = (over = {}) => ({
  channel: 'NayaPay',
  bank_name: 'NayaPay',
  account_number: ACCOUNT,
  account_title: TITLE,
  ...over,
});

let db;
let payout;
let vault;
const created = { users: [] };
const savedEnv = {};

const newId = () => crypto.randomUUID();
const now = () => Date.now();

const makeUser = async (name) => {
  const id = newId();
  const phone = `+99999${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`;
  await db.query(
    'INSERT INTO users (id, phone, display_name, created_at) VALUES ($1, $2, $3, $4)',
    [id, phone, name, now()]
  );
  created.users.push(id);
  return id;
};

const makeCard = async (userId) => {
  const id = newId();
  await db.query(
    `INSERT INTO cards (id, user_id, bank_name, card_type, card_tier, allow_sharing, created_at)
     VALUES ($1, $2, 'HBL', 'Visa', 'Gold', 1, $3)`,
    [id, userId, now()]
  );
  return id;
};

const befriend = (a, b) => db.query(
  `INSERT INTO circle (user_id, friend_id, c_status, created_at) VALUES ($1, $2, 'accepted', $3)`,
  [a, b, now()]
);

const createRequest = async (requester, holder, card) => {
  const { rows } = await db.query(
    `SELECT create_request($1, $2, $3, 'Daraz', NULL, 'Test address', 5000, 10, NULL) AS r`,
    [requester, holder, card]
  );
  return rows[0].r.id || rows[0].r.request_id;
};

const rejectsWith = async (promise, pattern) => {
  await assert.rejects(promise, (err) => pattern.test(err.message));
};

const captureConsole = () => {
  const lines = [];
  const orig = {};
  for (const m of ['log', 'info', 'warn', 'error']) {
    orig[m] = console[m];
    console[m] = (...args) => lines.push(args.map(String).join(' '));
  }
  return { lines, restore: () => { for (const m of Object.keys(orig)) console[m] = orig[m]; } };
};

test.before(async () => {
  if (skip) return;
  for (const k of ['DATABASE_URL', 'PAYOUT_VAULT_KEY', 'NODE_ENV', 'ALLOW_MOCK_PAYOUT_VERIFY']) {
    savedEnv[k] = process.env[k];
  }
  process.env.DATABASE_URL = TEST_URL;
  process.env.PAYOUT_VAULT_KEY = crypto.randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  delete process.env.ALLOW_MOCK_PAYOUT_VERIFY;

  db = require('../config/db');
  payout = require('../services/payout.service');
  vault = require('../utils/payoutVault');
});

test.after(async () => {
  if (skip || !db) return;
  const ids = created.users;
  if (ids.length) {
    await db.query('DELETE FROM requests WHERE requester_id = ANY($1) OR card_holder_id = ANY($1)', [ids]);
    await db.query('DELETE FROM cards WHERE user_id = ANY($1)', [ids]);
    await db.query('DELETE FROM circle WHERE user_id = ANY($1) OR friend_id = ANY($1)', [ids]);
    await db.query('DELETE FROM users WHERE id = ANY($1)', [ids]); // payout_vault cascades
  }
  await db.end();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('holder with no vault: hidden from circle cards, create_request refused', { skip }, async () => {
  const sara = await makeUser('Sara');
  const ahmed = await makeUser('Ahmed');
  await befriend(sara, ahmed);
  const card = await makeCard(ahmed);

  const state = await payout.getPublicState(ahmed);
  assert.equal(state.payout_status, 'none');

  const { rows } = await db.query('SELECT get_circle_cards($1, $2) AS r', [sara, ahmed]);
  assert.equal(rows[0].r.length, 0);

  await rejectsWith(createRequest(sara, ahmed, card), /not linked a payout account/i);
});

test('linking stores ciphertext only and returns masked public data', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  const result = await payout.saveDestination(ahmed, details());

  assert.equal(result.payout_status, 'verified');
  assert.equal(result.masked_display, '****7890');
  assert.equal(result.relinked_at, null);
  for (const forbidden of ['ciphertext', 'iv', 'auth_tag', 'account_number', 'account_title']) {
    assert.ok(!(forbidden in result), `public state must not expose ${forbidden}`);
  }
  assert.ok(!JSON.stringify(result).includes(ACCOUNT));

  const { rows } = await db.query('SELECT * FROM payout_vault WHERE user_id = $1', [ahmed]);
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows[0]).includes(ACCOUNT));
  assert.ok(!JSON.stringify(rows[0]).includes('Ahmed Ali'));
  assert.deepEqual(
    vault.decrypt(rows[0], ahmed),
    { account_number: ACCOUNT, account_title: TITLE }
  );
});

test('verified holder: visible in circle cards, request created and accepted (no cooldown on first link)', { skip }, async () => {
  const sara = await makeUser('Sara');
  const ahmed = await makeUser('Ahmed');
  await befriend(sara, ahmed);
  const card = await makeCard(ahmed);
  await payout.saveDestination(ahmed, details());

  const { rows } = await db.query('SELECT get_circle_cards($1, $2) AS r', [sara, ahmed]);
  assert.equal(rows[0].r.length, 1);

  const requestId = await createRequest(sara, ahmed, card);
  assert.ok(requestId);
  const accepted = await db.query('SELECT accept_request($1, $2) AS r', [requestId, ahmed]);
  assert.equal(accepted.rows[0].r.rq_status, 'payment_pending');
});

test('replace and remove are blocked while the holder has an active order', { skip }, async () => {
  const sara = await makeUser('Sara');
  const ahmed = await makeUser('Ahmed');
  await befriend(sara, ahmed);
  const card = await makeCard(ahmed);
  await payout.saveDestination(ahmed, details());

  const requestId = await createRequest(sara, ahmed, card);
  await db.query('SELECT accept_request($1, $2)', [requestId, ahmed]); // payment_pending = active

  await rejectsWith(
    payout.saveDestination(ahmed, details({ account_number: 'PK00ABCD0000009999999999' })),
    /active order/i
  );
  await rejectsWith(payout.removeDestination(ahmed), /active order/i);

  // original destination untouched
  const state = await payout.getPublicState(ahmed);
  assert.equal(state.payout_status, 'verified');
  assert.equal(state.masked_display, '****7890');
});

test('replacing a verified account sets the cooldown and accept is blocked for 24h', { skip }, async () => {
  const sara = await makeUser('Sara');
  const ahmed = await makeUser('Ahmed');
  await befriend(sara, ahmed);
  const card = await makeCard(ahmed);
  await payout.saveDestination(ahmed, details());

  const requestId = await createRequest(sara, ahmed, card); // pending is not "active"
  const replaced = await payout.saveDestination(
    ahmed,
    details({ account_number: 'PK00ABCD0000009999999999' })
  );
  assert.equal(replaced.masked_display, '****9999');
  assert.ok(replaced.relinked_at, 'relinked_at should be set on replace');

  await rejectsWith(
    db.query('SELECT accept_request($1, $2)', [requestId, ahmed]),
    /24 hours/i
  );
});

test('first link does not set a cooldown', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  const state = await payout.saveDestination(ahmed, details());
  assert.equal(state.relinked_at, null);
});

test('remove works with no active order and returns state to none', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  await payout.saveDestination(ahmed, details());
  await payout.removeDestination(ahmed);
  const state = await payout.getPublicState(ahmed);
  assert.equal(state.payout_status, 'none');
  await rejectsWith(payout.removeDestination(ahmed), /no payout account/i);
});

test('mark_payout_verified without a vault row errors', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  await rejectsWith(db.query('CALL mark_payout_verified($1)', [ahmed]), /no payout account/i);
});

test('a row saved but not verified reads as pending and cannot accept', { skip }, async () => {
  const sara = await makeUser('Sara');
  const ahmed = await makeUser('Ahmed');
  await befriend(sara, ahmed);
  const card = await makeCard(ahmed);
  const enc = vault.encrypt({ account_number: ACCOUNT, account_title: TITLE }, ahmed);
  await db.query(
    'CALL save_payout_destination($1, $2, $3, $4, $5, $6, $7, $8)',
    [ahmed, enc.ciphertext, enc.iv, enc.auth_tag, enc.key_version, 'HBL', 'HBL', '****7890']
  );

  const state = await payout.getPublicState(ahmed);
  assert.equal(state.payout_status, 'pending');
  await rejectsWith(createRequest(sara, ahmed, card), /not linked a payout account/i);

  // ciphertext function only serves verified rows
  const { rows } = await db.query('SELECT get_payout_ciphertext($1) AS r', [ahmed]);
  assert.equal(rows[0].r, null);
});

test('a failed shape check stores nothing and keeps an existing destination', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  await payout.saveDestination(ahmed, details());

  await assert.rejects(
    payout.saveDestination(ahmed, details({ account_number: '12' })),
    (err) => err.name === 'PayoutError'
  );
  const state = await payout.getPublicState(ahmed);
  assert.equal(state.payout_status, 'verified');
  assert.equal(state.masked_display, '****7890');
});

test('tampered row and a row copied to another user both fail to decrypt', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  const other = await makeUser('Other');
  await payout.saveDestination(ahmed, details());
  await payout.saveDestination(other, details({ account_number: 'PK00ABCD0000009999999999' }));

  // Healthy path: decrypts, then hits the not-integrated stub (501)
  await assert.rejects(payout.sendPayout(ahmed), (err) => err.status === 501);

  // Copy Ahmed's ciphertext onto Other's row: AAD (user id) mismatch must fail
  await db.query(
    `UPDATE payout_vault v
     SET ciphertext = a.ciphertext, iv = a.iv, auth_tag = a.auth_tag
     FROM payout_vault a
     WHERE v.user_id = $1 AND a.user_id = $2`,
    [other, ahmed]
  );
  await assert.rejects(payout.sendPayout(other), (err) => err.status !== 501);

  // Flip a byte of Ahmed's ciphertext in place
  const { rows } = await db.query('SELECT ciphertext FROM payout_vault WHERE user_id = $1', [ahmed]);
  const buf = Buffer.from(rows[0].ciphertext, 'base64');
  buf[0] ^= 1;
  await db.query('UPDATE payout_vault SET ciphertext = $1 WHERE user_id = $2', [buf.toString('base64'), ahmed]);
  await assert.rejects(payout.sendPayout(ahmed), (err) => err.status !== 501);
});

test('account details never appear in console output during link, failure, or decrypt', { skip }, async () => {
  const ahmed = await makeUser('Ahmed');
  const cap = captureConsole();
  try {
    await payout.saveDestination(ahmed, details());
    await payout.saveDestination(ahmed, details({ account_number: '12' })).catch(() => {});
    await payout.sendPayout(ahmed).catch(() => {});
  } finally {
    cap.restore();
  }
  const output = cap.lines.join('\n');
  assert.ok(!output.includes(ACCOUNT));
  assert.ok(!output.includes(TITLE));
});

test('anon/authenticated roles cannot execute vault functions or read the table', { skip }, async (t) => {
  const roles = await db.query(
    `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`
  );
  if (!roles.rows.length) return t.skip('anon/authenticated roles not present (non-Supabase DB)');

  for (const { rolname } of roles.rows) {
    const { rows } = await db.query(
      `SELECT
         has_function_privilege($1, 'get_payout_ciphertext(varchar)', 'EXECUTE') AS cipher_fn,
         has_function_privilege($1, 'get_payout_public(varchar)', 'EXECUTE') AS public_fn,
         has_table_privilege($1, 'payout_vault', 'SELECT') AS tbl`,
      [rolname]
    );
    assert.equal(rows[0].cipher_fn, false, `${rolname} must not execute get_payout_ciphertext`);
    assert.equal(rows[0].public_fn, false, `${rolname} must not execute get_payout_public`);
    assert.equal(rows[0].tbl, false, `${rolname} must not read payout_vault`);
  }
});
