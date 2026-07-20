const express = require('express');
const router = express.Router();

const renderPage = (res, { title, message, requestId, tone }) => {
  const accent = tone === 'success' ? '#16a34a' : '#dc2626';
  const requestLine = requestId
    ? `<p class="meta">Order: <code>${requestId}</code></p>`
    : '';

  res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — CardCircle</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #111; }
    h1 { color: ${accent}; font-size: 1.5rem; }
    p { line-height: 1.5; color: #444; }
    code { font-size: 0.85rem; word-break: break-all; }
    .meta { margin-top: 1.5rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
  ${requestLine}
  <p class="meta">You can close this tab and return to the CardCircle app.</p>
</body>
</html>`);
};

// Safepay hosted checkout redirect targets (browser only — escrow locks via webhook).
router.get('/success', (req, res) => {
  const requestId = typeof req.query.request_id === 'string' ? req.query.request_id.trim() : null;

  renderPage(res, {
    title: 'Payment received',
    message: 'Your payment was submitted to Safepay. Escrow will lock automatically once Safepay confirms it — usually within a few seconds.',
    requestId,
    tone: 'success',
  });
});

router.get('/cancel', (req, res) => {
  const requestId = typeof req.query.request_id === 'string' ? req.query.request_id.trim() : null;

  renderPage(res, {
    title: 'Payment cancelled',
    message: 'You cancelled checkout. No payment was taken. You can try again from the CardCircle app.',
    requestId,
    tone: 'cancel',
  });
});

module.exports = router;
