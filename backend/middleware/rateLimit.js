const rateLimit = require('express-rate-limit');

const rateLimitResponse = (req, res) => {
  res.status(429).json({ error: 'Too many requests. Please try again later.' });
};

const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

const pinVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

// Keyed per logged-in user (must run after auth middleware)
const payoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

module.exports = {
  otpSendLimiter,
  otpVerifyLimiter,
  pinVerifyLimiter,
  payoutLimiter,
};
