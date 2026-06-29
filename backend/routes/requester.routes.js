const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const {
  createRequest,
  cancelRequest,
  confirmPayment,
  getActiveRequest,
  confirmTracking,
  raiseDispute,
  getTransactionHistory,
} = require('../controllers/requester.controller');

router.use(auth);

router.get   ('/transactions/history', getTransactionHistory);
router.get   ('/active',               getActiveRequest);
router.post  ('/',                    createRequest);
router.delete('/:id',                 cancelRequest);
router.post  ('/:id/payment',         confirmPayment);
router.post  ('/:id/confirm',         confirmTracking);
router.post  ('/:id/dispute',         raiseDispute);

module.exports = router;
