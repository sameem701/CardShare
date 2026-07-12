const { randomUUID } = require('crypto');
const { getSupabase, getScreenshotBucket, isSupabaseConfigured } = require('../config/supabase');
const { isStoragePath } = require('./screenshotPath');

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

const getMaxScreenshotBytes = () => {
  const parsed = Number(process.env.SCREENSHOT_MAX_BYTES);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 512000;
};

const formatMaxScreenshotSize = () => {
  const bytes = getMaxScreenshotBytes();
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

const createScreenshotUploadSlot = async (requestId, extension = 'jpg') => {
  const ext = normalizeExtension(extension);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('extension must be jpg, jpeg, png, or webp.');
  }

  const path = `${requestId}/${randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const supabase = getSupabase();
  const bucket = getScreenshotBucket();

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

const getSignedScreenshotReadUrl = async (path) => {
  if (!isSupabaseConfigured() || !isStoragePath(path)) {
    return null;
  }

  const supabase = getSupabase();
  const bucket = getScreenshotBucket();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path.trim(), SIGNED_READ_TTL_SEC);

  if (error) {
    return null;
  }

  return data.signedUrl;
};

const verifyScreenshotFile = async (path) => {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Screenshot storage is not configured.' };
  }

  if (!isStoragePath(path)) {
    return { ok: false, error: 'Invalid screenshot path.' };
  }

  const bucket = getScreenshotBucket();
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
    return { ok: false, error: 'Screenshot file not found. Upload the image first.' };
  }

  if (!res.ok) {
    return { ok: false, error: 'Could not verify screenshot file.' };
  }

  const contentType = (res.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const contentLength = Number(res.headers.get('content-length'));

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return { ok: false, error: 'Screenshot must be JPEG, PNG, or WebP.' };
  }

  const extension = path.trim().split('.').pop()?.toLowerCase();
  const expectedMime = EXTENSION_MIME[extension];
  if (expectedMime && contentType !== expectedMime) {
    return {
      ok: false,
      error: 'Screenshot file type does not match its extension.',
    };
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return { ok: false, error: 'Screenshot file is empty or unreadable.' };
  }

  const maxBytes = getMaxScreenshotBytes();
  if (contentLength > maxBytes) {
    return {
      ok: false,
      error: `Screenshot must be ${formatMaxScreenshotSize()} or smaller.`,
    };
  }

  return { ok: true, content_type: contentType, size: contentLength };
};

const attachSignedScreenshotUrl = async (record) => {
  if (!record || !record.screenshot_url) {
    return record;
  }

  const screenshot_signed_url = await getSignedScreenshotReadUrl(record.screenshot_url);
  return { ...record, screenshot_signed_url };
};

module.exports = {
  createScreenshotUploadSlot,
  getSignedScreenshotReadUrl,
  verifyScreenshotFile,
  attachSignedScreenshotUrl,
  SIGNED_READ_TTL_SEC,
  getMaxScreenshotBytes,
};
