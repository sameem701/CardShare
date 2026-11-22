const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/profile.controller');

router.get('/', auth, controller.getProfile);
router.get('/stats', auth, controller.getStats);
router.post('/find-by-phone', auth, controller.findUserByPhone);
router.post('/find-by-phones', auth, controller.findUsersByPhones);

module.exports = router;
