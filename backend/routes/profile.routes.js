const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/profile.controller');

router.get('/', auth, controller.getProfile);
router.post('/find-by-phone', auth, controller.findUserByPhone);

module.exports = router;
