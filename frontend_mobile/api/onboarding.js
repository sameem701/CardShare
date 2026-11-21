import { apiRequest } from './client';

export function updateProfile(sessionId, userId, displayName, city) {
  return apiRequest('/api/onboarding/profile', {
    method: 'POST',
    body: { display_name: displayName, city },
    sessionId,
    userId,
  });
}
