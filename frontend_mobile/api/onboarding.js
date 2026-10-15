import { apiRequest } from './client';

export function updateProfile(sessionId, userId, displayName) {
  return apiRequest('/api/onboarding/profile', {
    method: 'POST',
    body: { display_name: displayName },
    sessionId,
    userId,
  });
}
