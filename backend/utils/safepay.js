const safepaySdk = require('@sfpy/node-core');

const DEFAULT_SAFEPAY_API_BASE = 'https://sandbox.api.getsafepay.com';
const DEFAULT_APP_URL = 'http://localhost:3000';

const getSafepayConfig = () => {
  const merchantApiKey = process.env.SAFEPAY_MERCHANT_API_KEY || process.env.SAFEPAY_PUBLIC_KEY;
  const secretKey = process.env.SAFEPAY_SECRET_KEY;

  if (!merchantApiKey) {
    throw new Error('SAFEPAY_MERCHANT_API_KEY is not configured.');
  }
  if (!secretKey) {
    throw new Error('SAFEPAY_SECRET_KEY is not configured.');
  }

  const apiBase = (process.env.SAFEPAY_API_BASE || DEFAULT_SAFEPAY_API_BASE).replace(/\/$/, '');
  return { merchantApiKey, secretKey, apiBase };
};

const getSafepayEnvironment = () => {
  const configured = (process.env.SAFEPAY_ENV || '').trim().toLowerCase();
  if (configured === 'development' || configured === 'sandbox' || configured === 'production') {
    return configured;
  }

  const apiBase = (process.env.SAFEPAY_API_BASE || DEFAULT_SAFEPAY_API_BASE).toLowerCase();
  if (apiBase.includes('dev.api.getsafepay.com')) return 'development';
  if (apiBase.includes('sandbox.api.getsafepay.com')) return 'sandbox';
  return 'production';
};

const getAppUrl = () => (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/$/, '');

const createSafepayClient = () => {
  const { secretKey, apiBase } = getSafepayConfig();
  return safepaySdk(secretKey, {
    authType: 'secret',
    host: apiBase,
  });
};

const formatSafepayError = (err, action) => {
  const detail = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
  return new Error(`Safepay ${action} failed: ${detail}`);
};

// Calls Safepay setupPayment — amount in paisa (PKR × 100).
const createPaymentTracker = async ({ requestId, amountPaisa }) => {
  const { merchantApiKey } = getSafepayConfig();
  const safepay = createSafepayClient();

  let response;
  try {
    response = await safepay.payments.session.setup({
      merchant_api_key: merchantApiKey,
      intent: 'CYBERSOURCE',
      mode: 'payment',
      currency: 'PKR',
      amount: amountPaisa,
      entry_mode: 'flex',
      metadata: {
        order_id: requestId,
      },
    });
  } catch (err) {
    throw formatSafepayError(err, 'setupPayment');
  }

  const tracker = response?.data?.tracker?.token ?? response?.token;
  if (!tracker) {
    throw new Error('Safepay setupPayment did not return a tracker token.');
  }

  return tracker;
};

const createPassportToken = async () => {
  const safepay = createSafepayClient();

  let response;
  try {
    response = await safepay.client.passport.create();
  } catch (err) {
    throw formatSafepayError(err, 'passport.create');
  }

  const token = response?.data?.token ?? response?.data ?? response?.token;
  if (!token || typeof token !== 'string') {
    throw new Error('Safepay passport.create did not return an authentication token.');
  }

  return token;
};

const createHostedCheckoutUrl = async ({ tracker, requestId }) => {
  if (!tracker) {
    throw new Error('Tracker is required to create a hosted checkout URL.');
  }

  const safepay = createSafepayClient();
  const tbt = await createPassportToken();
  const appUrl = getAppUrl();
  const requestQuery = encodeURIComponent(requestId);

  return safepay.checkout.createCheckoutUrl({
    env: getSafepayEnvironment(),
    tracker,
    tbt,
    source: 'hosted',
    redirect_url: `${appUrl}/payment/success?request_id=${requestQuery}`,
    cancel_url: `${appUrl}/payment/cancel?request_id=${requestQuery}`,
  });
};

module.exports = {
  createPaymentTracker,
  createPassportToken,
  createHostedCheckoutUrl,
};
