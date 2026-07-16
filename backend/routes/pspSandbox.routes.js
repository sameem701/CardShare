const express = require('express');
const router = express.Router();
const { requireDevPsp } = require('../middleware/devPsp');
const controller = require('../controllers/pspSandbox.controller');

// Same gate as /api/psp/dev — disabled in production unless ALLOW_DEV_PSP=true.
router.use(requireDevPsp);

router.get('/return', controller.sandboxReturn);
router.post('/return', controller.sandboxReturn);

router.get('/cancel', controller.sandboxCancel);
router.post('/cancel', controller.sandboxCancel);

router.post('/ipn', controller.sandboxIpn);

module.exports = router;
