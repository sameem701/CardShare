const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/stores.controller');

router.get('/', auth, controller.searchStores);
router.get('/card-preview', auth, controller.listCardEarnPreview);
router.get('/:id/offers', auth, controller.listStoreOffers);
router.get('/:id/apply', auth, controller.applyStore);

module.exports = router;
