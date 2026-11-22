import { apiRequest } from './client';

function withCity(params, city) {
  const value = String(city || '').trim();
  if (value) params.set('city', value);
  return params;
}

export function searchStores(sessionId, userId, query, options = {}) {
  const params = withCity(new URLSearchParams(), options.city);
  const q = String(query || '').trim();
  if (q) params.set('q', q);
  const suffix = params.toString() ? `?${params}` : '';
  return apiRequest(`/api/stores${suffix}`, { sessionId, userId, signal: options.signal });
}

export function listStoreOffers(sessionId, userId, storeId, amount, options = {}) {
  const params = withCity(new URLSearchParams(), options.city);
  if (amount != null) params.set('amount', String(amount));
  return apiRequest(`/api/stores/${storeId}/offers?${params}`, {
    sessionId,
    userId,
    signal: options.signal,
  });
}

export function listCardEarnPreview(sessionId, userId, bank, tier, options = {}) {
  const params = withCity(new URLSearchParams({ bank, tier }), options.city);
  return apiRequest(`/api/stores/card-preview?${params}`, {
    sessionId,
    userId,
    signal: options.signal,
  });
}

export function applyStore(sessionId, userId, storeId, amount, options = {}) {
  const params = withCity(new URLSearchParams(), options.city);
  if (amount != null) params.set('amount', String(amount));
  return apiRequest(`/api/stores/${storeId}/apply?${params}`, {
    sessionId,
    userId,
    signal: options.signal,
  });
}
