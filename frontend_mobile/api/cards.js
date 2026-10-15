import { apiRequest } from './client';

export const ALLOWED_BANKS = [
  'HBL',
  'MCB',
  'UBL',
  'Meezan',
  'Bank Alfalah',
  'Faysal Bank',
  'Standard Chartered',
  'Askari',
  'Silk Bank',
  'Allied Bank',
  'Habib Metro',
  'JS Bank',
  'Soneri Bank',
  'Bank Al Habib',
];

export const ALLOWED_CARD_TIERS = [
  'Classic',
  'Gold',
  'Platinum',
  'Titanium',
  'Signature',
  'World',
];

export function getCards(sessionId, userId) {
  return apiRequest('/api/cards', { sessionId, userId });
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
