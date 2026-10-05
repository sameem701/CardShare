const express = require('express');
const router = express.Router();
const { requireDevPsp, verifyDevPspSecret } = require('../middleware/devPsp');
const controller = require('../controllers/psp.controller');

router.use(requireDevPsp, verifyDevPspSecret);

router.post('/escrow/locked', controller.escrowLocked);

module.exports = router;
