import { apiRequest } from './client';

export function getActiveRequests(sessionId, userId, options = {}) {
  return apiRequest('/api/requester/requests', { sessionId, userId, signal: options.signal });
}

export function getRequest(sessionId, userId, requestId, options = {}) {
  return apiRequest(`/api/requester/requests/${requestId}`, { sessionId, userId, signal: options.signal });
}

export function createRequest(sessionId, userId, payload) {
  return apiRequest('/api/requester/requests', {
    method: 'POST',
    body: payload,
    sessionId,
    userId,
  });
}

export function cancelRequest(sessionId, userId, requestId, reason) {
  return apiRequest(`/api/requester/requests/${requestId}`, {
    method: 'DELETE',
    body: reason != null ? { reason } : {},
    sessionId,
    userId,
  });
}

export function acceptProof(sessionId, userId, requestId) {
  return apiRequest(`/api/requester/requests/${requestId}/accept-proof`, {
    method: 'POST',
    sessionId,
    userId,
  });
}

export function rejectProof(sessionId, userId, requestId) {
  return apiRequest(`/api/requester/requests/${requestId}/reject-proof`, {
    method: 'POST',
    sessionId,
    userId,
  });
}

export function getRequesterHistory(sessionId, userId, options = {}) {
  return apiRequest('/api/requester/history', { sessionId, userId, signal: options.signal });
}

export function getUnpaidRequests(sessionId, userId, options = {}) {
  return apiRequest('/api/requester/unpaid', { sessionId, userId, signal: options.signal });
}

export function getRequesterTransaction(sessionId, userId, txnId, options = {}) {
  return apiRequest(`/api/requester/transactions/${txnId}`, { sessionId, userId, signal: options.signal });
}
