import { API_BASE_URL } from '../constants/config';

const REQUEST_TIMEOUT_MS = 15000;

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { error: 'Invalid server response format.' };
  }
}

export async function apiRequest(path, { method = 'GET', body, sessionId, userId } = {}) {
  // TEMPORARY: UI/UX only. Every request succeeds locally and never reaches the backend.
  // Set SKIP_BACKEND to false to send real requests again.
  const SKIP_BACKEND = true;

  if (SKIP_BACKEND) {
    if (path === '/api/auth/otp/verify') {
      return {
        session_id: 'local-session',
        user: {
          id: 'local-user',
          phone: body?.phone ?? '',
          display_name: null,
          created_at: Date.now(),
        },
      };
    }

    if (path === '/api/auth/otp/send') {
      return { message: 'OTP sent.' };
    }

    return { ok: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { Authorization: `Bearer ${sessionId}` } : {}),
        ...(userId ? { 'X-User-Id': userId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out. Check that the backend is running.');
    }

    throw new Error(`Network error. Check that the backend is running at ${API_BASE_URL}.`);
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message = payload?.error || 'Request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
