require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');

const authRoutes       = require('./routes/auth.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const profileRoutes    = require('./routes/profile.routes');
const cardRoutes       = require('./routes/cards.routes');
const circleRoutes     = require('./routes/circle.routes');
const requesterRoutes  = require('./routes/requester.routes');
const holderRoutes     = require('./routes/holder.routes');
const walletRoutes     = require('./routes/wallet.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

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
    // No Origin: Postman, curl, native mobile — allow
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id'],
}));
app.use(express.json());

app.use('/api/auth',       authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/profile',    profileRoutes);
app.use('/api/cards',      cardRoutes);
app.use('/api/circle',     circleRoutes);
app.use('/api/requests',   requesterRoutes);
app.use('/api/orders',     holderRoutes);
app.use('/api/wallet',     walletRoutes);

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
