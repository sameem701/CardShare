import { apiRequest } from './client';

export function getMessages(sessionId, userId, threadId, page = {}) {
  const params = new URLSearchParams();
  if (page.beforeCreatedAt != null && page.beforeId) {
    params.set('before_created_at', String(page.beforeCreatedAt));
    params.set('before_id', String(page.beforeId));
  }
  if (page.limit) params.set('limit', String(page.limit));
  const query = params.toString();
  return apiRequest(`/api/chat/${threadId}${query ? `?${query}` : ''}`, { sessionId, userId });
}

export function sendMessage(sessionId, userId, threadId, message, attachmentPath) {
  return apiRequest(`/api/chat/${threadId}`, {
    method: 'POST',
    body: {
      message: message || undefined,
      attachment_path: attachmentPath || undefined,
    },
    sessionId,
    userId,
  });
}

export function getChatImageUploadUrl(sessionId, userId, threadId, extension) {
  return apiRequest(`/api/chat/${threadId}/image/upload-url`, {
    method: 'POST',
    body: extension ? { extension } : {},
    sessionId,
    userId,
  });
}
