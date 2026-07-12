const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/circle.controller');

router.use(auth);

router.post('/invite', controller.sendInvite);
router.patch('/invite/:friend_id', controller.respondToInvite);
router.get('/', controller.getCircle);
router.get('/:friend_id/cards', controller.getCircleCards);
router.delete('/:friend_id', controller.removeFromCircle);

module.exports = router;
