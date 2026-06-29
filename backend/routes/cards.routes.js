const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/cards.controller');
const auth       = require('../middleware/auth');

router.post('/',              auth, controller.addCard);
router.get('/',               auth, controller.getCards);
router.patch('/:id/sharing',  auth, controller.toggleCardSharing);
router.delete('/:id',         auth, controller.deleteCard);

module.exports = router;
