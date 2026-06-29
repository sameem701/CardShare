const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/onboarding.controller');
const auth       = require('../middleware/auth');

router.post('/profile',  auth, controller.updateProfile);
router.post('/pin',      auth, controller.upsertPin);
router.post('/security', auth, controller.setSecurityQuestion);
router.post('/complete', auth, controller.completeOnboarding);

module.exports = router;
