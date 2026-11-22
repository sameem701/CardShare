import { apiRequest } from './client';

export function getProfile(sessionId, userId) {
  return apiRequest('/api/profile', { sessionId, userId });
}

export function getUserStats(sessionId, userId, options = {}) {
  return apiRequest('/api/profile/stats', { sessionId, userId, signal: options.signal });
}

export function findUserByPhone(sessionId, userId, phone) {
  return apiRequest('/api/profile/find-by-phone', {
    method: 'POST',
    body: { phone },
    sessionId,
    userId,
  });
}

export function findUsersByPhones(sessionId, userId, phones) {
  return apiRequest('/api/profile/find-by-phones', {
    method: 'POST',
    body: { phones },
    sessionId,
    userId,
  });
}
