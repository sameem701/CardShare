import { apiRequest } from './client';

export function getActiveRequests(sessionId, userId) {
  return apiRequest('/api/requester/requests', { sessionId, userId });
}

export function getRequest(sessionId, userId, requestId) {
  return apiRequest(`/api/requester/requests/${requestId}`, { sessionId, userId });
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

export function getRequesterHistory(sessionId, userId) {
  return apiRequest('/api/requester/history', { sessionId, userId });
}
