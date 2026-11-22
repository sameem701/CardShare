const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/requester.controller');

router.use(auth);

router.get('/history', controller.getTransactionHistory);
router.get('/unpaid', controller.getUnpaid);
router.get('/transactions/:id', controller.getTransaction);
router.get('/requests', controller.getActiveRequests);
router.post('/requests', controller.createRequest);
router.get('/groups/:groupId', controller.getOrderGroup);
router.post('/groups/:groupId/choose', controller.chooseBroadcastHolder);
router.put('/groups/:groupId/products', controller.replaceProducts);
router.get('/requests/:id', controller.getRequest);
router.delete('/requests/:id', controller.cancelRequest);
router.post('/requests/:id/accept-proof', controller.acceptProof);
router.post('/requests/:id/reject-proof', controller.rejectProof);

module.exports = router;
