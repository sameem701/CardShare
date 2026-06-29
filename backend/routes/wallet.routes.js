const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/auth');
const { requireFakeWallet } = require('../middleware/fakeWallet');
const { topUp, withdraw } = require('../controllers/wallet.controller');

router.use(auth);
router.use(requireFakeWallet);

router.post('/topup',    topUp);
router.post('/withdraw', withdraw);

module.exports = router;
