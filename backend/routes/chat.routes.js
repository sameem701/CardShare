const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/chat.controller');

router.use(auth);

router.get('/:request_id', controller.getMessages);
router.post('/:request_id/image/upload-url', controller.getChatImageUploadUrl);
router.post('/:request_id', controller.sendMessage);

module.exports = router;
