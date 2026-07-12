const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/holder.controller');

router.use(auth);

router.get('/history', controller.getTransactionHistory);
router.get('/incoming', controller.getIncomingRequests);
router.get('/orders', controller.getActiveOrders);
router.get('/orders/:id', controller.getOrder);
router.post('/orders/:id/accept', controller.acceptRequest);
router.post('/orders/:id/decline', controller.declineRequest);
router.post('/orders/:id/screenshot/upload-url', controller.getScreenshotUploadUrl);
router.post('/orders/:id/tracking', controller.submitTracking);
router.delete('/orders/:id', controller.cancelOrder);

module.exports = router;
