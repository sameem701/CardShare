const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  getIncomingRequests,
  acceptRequest,
  declineRequest,
  cancelOrder,
  submitTracking,
  getActiveOrders,
  getOrder,
  getTransactionHistory,
} = require('../controllers/holder.controller');

router.use(auth);

// Static paths must come before /:id to avoid Express matching "incoming" as an id
router.get   ('/incoming',        getIncomingRequests);
router.get   ('/history',         getTransactionHistory);
router.get   ('/',                getActiveOrders);
router.get   ('/:id',             getOrder);
router.post  ('/:id/accept',      acceptRequest);
router.post  ('/:id/decline',     declineRequest);
router.delete('/:id',             cancelOrder);
router.post  ('/:id/tracking',    submitTracking);

module.exports = router;
