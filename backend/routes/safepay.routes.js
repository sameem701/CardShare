const express = require('express');
const router = express.Router();
const controller = require('../controllers/safepay.controller');

router.post('/', controller.escrowWebhookHandler);

module.exports = router;
