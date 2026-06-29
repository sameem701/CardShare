const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/profile.controller');
const auth       = require('../middleware/auth');

router.get('/', auth, controller.getProfile);

module.exports = router;
