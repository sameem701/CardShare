import { apiRequest } from './client';

export function getCircle(sessionId, userId, options = {}) {
  return apiRequest('/api/circle', { sessionId, userId, signal: options.signal });
}

export function sendCircleInvite(sessionId, userId, friendId, contactName, inviteVia = 'app') {
  const body = { friend_id: friendId, invite_via: inviteVia === 'link' ? 'link' : 'app' };
  if (contactName) body.contact_name = contactName;
  return apiRequest('/api/circle/invite', {
    method: 'POST',
    body,
    sessionId,
    userId,
  });
}

export function getInviteLink(sessionId, userId) {
  return apiRequest('/api/circle/invite-link', { sessionId, userId });
}

export function lookupInviteLink(code) {
  const params = new URLSearchParams({ code: String(code || '').trim() });
  return apiRequest(`/api/circle/invite-link/lookup?${params}`);
}

export function resolveInviteLink(sessionId, userId, code) {
  const params = new URLSearchParams({ code: String(code || '').trim() });
  return apiRequest(`/api/circle/invite-link/resolve?${params}`, { sessionId, userId });
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

export function getSharingCards(sessionId, userId, options = {}) {
  return apiRequest('/api/circle/sharing-cards', { sessionId, userId, signal: options.signal });
}

export function getCircleCards(sessionId, userId, friendId, options = {}) {
  return apiRequest(`/api/circle/${friendId}/cards`, { sessionId, userId, signal: options.signal });
}

export function getCardHolders(sessionId, userId, bank, tier, options = {}) {
  const params = new URLSearchParams({ bank, tier });
  return apiRequest(`/api/circle/card-holders?${params}`, { sessionId, userId, signal: options.signal });
}

export function removeFromCircle(sessionId, userId, friendId) {
  return apiRequest(`/api/circle/${friendId}`, {
    method: 'DELETE',
    sessionId,
    userId,
  });
}
