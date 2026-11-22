const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/cards.controller');

router.post('/', auth, controller.addCard);
router.get('/banks', auth, controller.listBanks);
router.get('/tiers', auth, controller.listCardTiers);
router.get('/', auth, controller.getCards);
router.get('/stats', auth, controller.getCardStats);
router.patch('/:id/sharing', auth, controller.toggleCardSharing);
router.delete('/:id', auth, controller.deleteCard);

module.exports = router;
