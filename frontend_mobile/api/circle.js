import { apiRequest } from './client';

export function getCircle(sessionId, userId) {
  return apiRequest('/api/circle', { sessionId, userId });
}

export function sendCircleInvite(sessionId, userId, friendId) {
  return apiRequest('/api/circle/invite', {
    method: 'POST',
    body: { friend_id: friendId },
    sessionId,
    userId,
  });
}

export function respondToCircleInvite(sessionId, userId, friendId, status) {
  return apiRequest(`/api/circle/invite/${friendId}`, {
    method: 'PATCH',
    body: { status },
    sessionId,
    userId,
  });
}

export function getCircleCards(sessionId, userId, friendId) {
  return apiRequest(`/api/circle/${friendId}/cards`, { sessionId, userId });
}

export function removeFromCircle(sessionId, userId, friendId) {
  return apiRequest(`/api/circle/${friendId}`, {
    method: 'DELETE',
    sessionId,
    userId,
  });
}
