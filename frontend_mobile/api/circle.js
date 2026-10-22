import { apiRequest } from './client';

export function getCircle(sessionId, userId, options = {}) {
  return apiRequest('/api/circle', { sessionId, userId, signal: options.signal });
}

export function sendCircleInvite(sessionId, userId, friendId, contactName) {
  return apiRequest('/api/circle/invite', {
    method: 'POST',
    body: contactName ? { friend_id: friendId, contact_name: contactName } : { friend_id: friendId },
    sessionId,
    userId,
  });
}

export function cancelCircleInvite(sessionId, userId, friendId) {
  return apiRequest(`/api/circle/invite/${friendId}`, {
    method: 'DELETE',
    sessionId,
    userId,
  });
}

export function respondToCircleInvite(sessionId, userId, friendId, status, contactName) {
  const body = status === 'accepted' && contactName
    ? { status, contact_name: contactName }
    : { status };
  return apiRequest(`/api/circle/invite/${friendId}`, {
    method: 'PATCH',
    body,
    sessionId,
    userId,
  });
}

export function getCircleCards(sessionId, userId, friendId, options = {}) {
  return apiRequest(`/api/circle/${friendId}/cards`, { sessionId, userId, signal: options.signal });
}

export function removeFromCircle(sessionId, userId, friendId) {
  return apiRequest(`/api/circle/${friendId}`, {
    method: 'DELETE',
    sessionId,
    userId,
  });
}
