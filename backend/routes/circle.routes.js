const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  sendInvite,
  respondToInvite,
  removeFromCircle,
  getCircle,
  getCircleCards,
} = require('../controllers/circle.controller');

router.use(auth);

router.post  ('/invite',               sendInvite);
router.patch ('/invite/:friend_id',    respondToInvite);
router.delete('/:friend_id',           removeFromCircle);
router.get   ('/',                     getCircle);
router.get   ('/:friend_id/cards',     getCircleCards);

module.exports = router;
