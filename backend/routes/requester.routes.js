const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/requester.controller');

router.use(auth);

router.get('/history', controller.getTransactionHistory);
router.get('/requests', controller.getActiveRequests);
router.post('/requests', controller.createRequest);
router.get('/requests/:id', controller.getRequest);
router.delete('/requests/:id', controller.cancelRequest);
router.post('/requests/:id/pay', controller.initiatePay);
router.post('/requests/:id/confirm', controller.confirmTracking);
router.post('/requests/:id/dispute', controller.raiseDispute);

module.exports = router;
