// Fake wallet topup/withdraw — MVP testing only. Real money uses PSP webhooks later.
// Optional cap per request in whole PKR (e.g. FAKE_WALLET_MAX_AMOUNT=500000 = Rs 500,000)
//
// Enabled when:
//   ALLOW_FAKE_WALLET=true
// OR (NODE_ENV !== 'production' and ALLOW_FAKE_WALLET is not explicitly 'false')
//
// Set ALLOW_FAKE_WALLET=false on a shared staging server even in development.

const fakeWalletEnabled = () => {
  const flag = process.env.ALLOW_FAKE_WALLET;

  if (flag === 'true') return true;
  if (flag === 'false') return false;

  return process.env.NODE_ENV !== 'production';
};

const requireFakeWallet = (req, res, next) => {
  if (fakeWalletEnabled()) {
    return next();
  }

  return res.status(403).json({
    error: 'Fake wallet top-up and withdraw are disabled.',
    code: 'FAKE_WALLET_DISABLED',
  });
};

module.exports = { requireFakeWallet, fakeWalletEnabled };
