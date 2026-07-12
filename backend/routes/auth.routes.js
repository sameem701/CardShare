const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  otpSendLimiter,
  otpVerifyLimiter,
  pinVerifyLimiter,
} = require('../middleware/rateLimit');
const controller = require('../controllers/auth.controller');

router.post('/status', controller.getLoginStatus);
router.post('/otp/send', otpSendLimiter, controller.sendOtp);
router.post('/otp/verify', otpVerifyLimiter, controller.verifyOtp);
router.post('/pin/verify', pinVerifyLimiter, controller.verifyPin);
router.post('/forgot-pin/question', controller.getForgotPinQuestion);
router.post('/forgot-pin/verify-answer', controller.verifyForgotPinAnswer);
router.post('/forgot-pin/reset', controller.resetForgotPin);
router.post('/refresh', controller.refreshToken);
router.post('/logout', auth, controller.logout);

module.exports = router;
