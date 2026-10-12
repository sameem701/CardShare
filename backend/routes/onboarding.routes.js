const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/onboarding.controller');

router.post('/profile', auth, controller.updateProfile);

module.exports = router;
