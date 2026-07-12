const { randomUUID } = require('crypto');
const {
  getSupabase,
  getChatImageBucket,
  isSupabaseConfigured,
} = require('../config/supabase');
const { isStoragePath, validateScreenshotPath } = require('./screenshotPath');

const SIGNED_READ_TTL_SEC = 3600;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const EXTENSION_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const getMaxChatImageBytes = () => {
  const parsed = Number(process.env.CHAT_IMAGE_MAX_BYTES);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 512000;
};

const formatMaxChatImageSize = () => {
  const bytes = getMaxChatImageBytes();
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
};

const normalizeExtension = (extension) => {
  const ext = String(extension || 'jpg').trim().toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  return ext;
};

const createChatImageUploadSlot = async (requestId, extension = 'jpg') => {
  const ext = normalizeExtension(extension);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('extension must be jpg, jpeg, png, or webp.');
  }

  const path = `${requestId}/${randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const supabase = getSupabase();
  const bucket = getChatImageBucket();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error) {
    throw new Error(error.message);
  }

  return {
    path: data.path,
    signed_url: data.signedUrl,
    token: data.token,
    expires_in: SIGNED_READ_TTL_SEC,
  };
};

const getSignedChatImageReadUrl = async (path) => {
  if (!isSupabaseConfigured() || !isStoragePath(path)) {
    return null;
  }

  const supabase = getSupabase();
  const bucket = getChatImageBucket();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path.trim(), SIGNED_READ_TTL_SEC);

  if (error) {
    return null;
  }

  return data.signedUrl;
};

const verifyChatImageFile = async (path) => {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Chat image storage is not configured.' };
  }

  if (!isStoragePath(path)) {
    return { ok: false, error: 'Invalid attachment path.' };
  }

  const bucket = getChatImageBucket();
  const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
  const encodedPath = path.trim().split('/').map(encodeURIComponent).join('/');
  const url = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodedPath}`;

  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (res.status === 404) {
    return { ok: false, error: 'Image not found. Upload the image first.' };
  }

  if (!res.ok) {
    return { ok: false, error: 'Could not verify chat image.' };
  }

  const contentType = (res.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const contentLength = Number(res.headers.get('content-length'));

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return { ok: false, error: 'Image must be JPEG, PNG, or WebP.' };
  }

  const extension = path.trim().split('.').pop()?.toLowerCase();
  const expectedMime = EXTENSION_MIME[extension];
  if (expectedMime && contentType !== expectedMime) {
    return {
      ok: false,
      error: 'Image file type does not match its extension.',
    };
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return { ok: false, error: 'Image file is empty or unreadable.' };
  }

  const maxBytes = getMaxChatImageBytes();
  if (contentLength > maxBytes) {
    return {
      ok: false,
      error: `Image must be ${formatMaxChatImageSize()} or smaller.`,
    };
  }

  return { ok: true, content_type: contentType, size: contentLength };
};

const attachSignedChatImageUrl = async (message) => {
  if (!message || !message.attachment_path) {
    return message;
  }

  const attachment_signed_url = await getSignedChatImageReadUrl(message.attachment_path);
  return { ...message, attachment_signed_url };
};

const attachSignedChatImageUrls = async (messages) => {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return Promise.all(messages.map(attachSignedChatImageUrl));
};

module.exports = {
  createChatImageUploadSlot,
  getSignedChatImageReadUrl,
  verifyChatImageFile,
  attachSignedChatImageUrls,
  validateAttachmentPath: validateScreenshotPath,
  SIGNED_READ_TTL_SEC,
  getMaxChatImageBytes,
};
