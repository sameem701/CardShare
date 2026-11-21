const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/circle.controller');

router.get('/invite-link/lookup', controller.lookupInviteLink);
router.get('/invite-link/resolve', auth, controller.resolveInviteLink);
router.get('/invite-link', auth, controller.getInviteLink);

router.post('/invite', auth, controller.sendInvite);
router.patch('/invite/:friend_id', auth, controller.respondToInvite);
router.delete('/invite/:friend_id', auth, controller.cancelInvite);
router.get('/', auth, controller.getCircle);
router.get('/sharing-cards', auth, controller.getSharingCards);
router.get('/card-holders', auth, controller.getCardHolders);
router.get('/:friend_id/cards', auth, controller.getCircleCards);
router.delete('/:friend_id', auth, controller.removeFromCircle);

module.exports = router;
