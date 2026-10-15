import { apiRequest } from './client';

export function getProfile(sessionId, userId) {
  return apiRequest('/api/profile', { sessionId, userId });
}

export function findUserByPhone(sessionId, userId, phone) {
  return apiRequest('/api/profile/find-by-phone', {
    method: 'POST',
    body: { phone },
    sessionId,
    userId,
  });
}
