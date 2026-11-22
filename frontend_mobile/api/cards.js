import { apiRequest } from './client';

export function getBanks(sessionId, userId, options = {}) {
  return apiRequest('/api/cards/banks', { sessionId, userId, signal: options.signal });
}

export function getTiers(sessionId, userId, options = {}) {
  return apiRequest('/api/cards/tiers', { sessionId, userId, signal: options.signal });
}

export function getCards(sessionId, userId, options = {}) {
  return apiRequest('/api/cards', { sessionId, userId, signal: options.signal });
}

export function getCardStats(sessionId, userId, options = {}) {
  return apiRequest('/api/cards/stats', { sessionId, userId, signal: options.signal });
}

export function addCard(sessionId, userId, bankName, cardTier) {
  return apiRequest('/api/cards', {
    method: 'POST',
    body: { bank_name: bankName, card_tier: cardTier },
    sessionId,
    userId,
  });
}

export function toggleCardSharing(sessionId, userId, cardId) {
  return apiRequest(`/api/cards/${cardId}/sharing`, {
    method: 'PATCH',
    sessionId,
    userId,
  });
}

export function deleteCard(sessionId, userId, cardId) {
  return apiRequest(`/api/cards/${cardId}`, {
    method: 'DELETE',
    sessionId,
    userId,
  });
}
