const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { payoutLimiter } = require('../middleware/rateLimit');
const controller = require('../controllers/payout.controller');

router.put('/', auth, payoutLimiter, controller.linkPayout);
router.get('/', auth, controller.getPayout);
router.delete('/', auth, payoutLimiter, controller.removePayout);

module.exports = router;
