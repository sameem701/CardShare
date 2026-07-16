const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Railway/Render/nginx/Cloudflare — use real client IP for rate limiting
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:8081',
];

const allowedOrigins = [
  ...defaultOrigins,
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Psp-Webhook-Secret'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/onboarding', require('./routes/onboarding.routes'));
app.use('/api/profile', require('./routes/profile.routes'));
app.use('/api/cards', require('./routes/cards.routes'));
app.use('/api/circle', require('./routes/circle.routes'));
app.use('/api/requester', require('./routes/requester.routes'));
app.use('/api/holder', require('./routes/holder.routes'));
app.use('/api/chat', require('./routes/chat.routes'));
app.use('/api/psp/dev', require('./routes/psp.routes'));
app.use('/api/psp/sandbox', require('./routes/pspSandbox.routes'));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`CardCircle server running on port ${PORT}`);
});
