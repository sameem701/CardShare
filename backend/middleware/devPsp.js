// Dev-only PSP webhook stubs until a real provider is integrated.
// Enable with ALLOW_DEV_PSP=true, or locally when NODE_ENV !== 'production'
// (unless ALLOW_DEV_PSP=false). Set PSP_DEV_WEBHOOK_SECRET in .env.

const devPspEnabled = () => {
  const flag = process.env.ALLOW_DEV_PSP;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

const requireDevPsp = (req, res, next) => {
  if (!devPspEnabled()) {
    return res.status(403).json({ error: 'Dev PSP webhooks are disabled.' });
  }
  next();
};

const verifyDevPspSecret = (req, res, next) => {
  const secret = process.env.PSP_DEV_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'PSP_DEV_WEBHOOK_SECRET is not configured.' });
  }

  if (req.headers['x-psp-webhook-secret'] !== secret) {
    return res.status(401).json({ error: 'Invalid webhook secret.' });
  }

  next();
};

module.exports = {
  requireDevPsp,
  verifyDevPspSecret,
  devPspEnabled,
};
