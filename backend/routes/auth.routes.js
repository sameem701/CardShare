const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  otpSendLimiter,
  otpVerifyLimiter,
} = require('../middleware/rateLimit');
const controller = require('../controllers/auth.controller');

router.post('/otp/send', otpSendLimiter, controller.sendOtp);
router.post('/otp/verify', otpVerifyLimiter, controller.verifyOtp);
router.post('/logout', auth, controller.logout);

module.exports = router;
