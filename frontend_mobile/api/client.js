import { API_BASE_URL } from '../constants/config';

const REQUEST_TIMEOUT_MS = 15000;

let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Invalid server response format.' };
  }
}

export async function apiRequest(path, { method = 'GET', body, sessionId, userId, signal } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { Authorization: `Bearer ${sessionId}` } : {}),
        ...(userId ? { 'X-User-Id': userId } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (signal?.aborted) {
        const aborted = new Error('Aborted');
        aborted.name = 'AbortError';
        throw aborted;
      }
      throw new Error('Request timed out. Check that the backend is running.');
    }

    throw new Error(`Network error. Check that the backend is running at ${API_BASE_URL}.`);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }

  const payload = await parseJsonResponse(response);

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    const message = payload?.error || 'Request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
