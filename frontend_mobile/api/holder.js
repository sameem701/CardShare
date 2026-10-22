import { apiRequest } from './client';

export function getIncomingRequests(sessionId, userId, options = {}) {
  return apiRequest('/api/holder/incoming', { sessionId, userId, signal: options.signal });
}

export function getActiveOrders(sessionId, userId, options = {}) {
  return apiRequest('/api/holder/orders', { sessionId, userId, signal: options.signal });
}

export function getOrder(sessionId, userId, orderId, options = {}) {
  return apiRequest(`/api/holder/orders/${orderId}`, { sessionId, userId, signal: options.signal });
}

export function acceptOrder(sessionId, userId, orderId) {
  return apiRequest(`/api/holder/orders/${orderId}/accept`, {
    method: 'POST',
    sessionId,
    userId,
  });
}

export function declineOrder(sessionId, userId, orderId) {
  return apiRequest(`/api/holder/orders/${orderId}/decline`, {
    method: 'POST',
    sessionId,
    userId,
  });
}

export function cancelOrder(sessionId, userId, orderId, reason) {
  return apiRequest(`/api/holder/orders/${orderId}`, {
    method: 'DELETE',
    body: { reason },
    sessionId,
    userId,
  });
}

export function getScreenshotUploadUrl(sessionId, userId, orderId, extension) {
  return apiRequest(`/api/holder/orders/${orderId}/screenshot/upload-url`, {
    method: 'POST',
    body: extension ? { extension } : {},
    sessionId,
    userId,
  });
}

export function submitProof(sessionId, userId, orderId, screenshotUrl, orderAmount, actualAmountPaid) {
  return apiRequest(`/api/holder/orders/${orderId}/proof`, {
    method: 'POST',
    body: {
      screenshot_url: screenshotUrl,
      order_amount: orderAmount,
      actual_amount_paid: actualAmountPaid,
    },
    sessionId,
    userId,
  });
}

export function getHolderHistory(sessionId, userId, options = {}) {
  return apiRequest('/api/holder/history', { sessionId, userId, signal: options.signal });
}

export function getUnpaidOrders(sessionId, userId, options = {}) {
  return apiRequest('/api/holder/unpaid', { sessionId, userId, signal: options.signal });
}

export function getHolderTransaction(sessionId, userId, txnId, options = {}) {
  return apiRequest(`/api/holder/transactions/${txnId}`, { sessionId, userId, signal: options.signal });
}

export function confirmPaid(sessionId, userId, txnId) {
  return apiRequest(`/api/holder/transactions/${txnId}/confirm-paid`, {
    method: 'POST',
    sessionId,
    userId,
  });
}
