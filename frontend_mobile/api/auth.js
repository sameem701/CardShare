import { apiRequest } from './client';

export function sendOtp(phone) {
  return apiRequest('/api/auth/otp/send', {
    method: 'POST',
    body: { phone },
  });
}

export function verifyOtp(phone, otp) {
  return apiRequest('/api/auth/otp/verify', {
    method: 'POST',
    body: { phone, otp },
  });
}

export function logout(sessionId, userId) {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    sessionId,
    userId,
  });
}
