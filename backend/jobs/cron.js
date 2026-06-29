const cron = require('node-cron');
const db = require('../config/db');

const CRON_EVERY_15_SECONDS = '*/15 * * * * *';

const runAutoExpireRequests = async () => {
  try {
    await db.query('CALL auto_expire_requests()');
  } catch (err) {
    console.error('[cron] auto_expire_requests failed:', err.message);
  }
};

const runAutoReleaseEscrow = async () => {
  try {
    await db.query('CALL auto_release_escrow()');
  } catch (err) {
    console.error('[cron] auto_release_escrow failed:', err.message);
  }
};

cron.schedule(CRON_EVERY_15_SECONDS, runAutoExpireRequests);
cron.schedule(CRON_EVERY_15_SECONDS, runAutoReleaseEscrow);

console.log('[cron] auto_expire_requests scheduled (every 15 seconds)');
console.log('[cron] auto_release_escrow scheduled (every 15 seconds)');
