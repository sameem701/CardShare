const MAX_PATH_LENGTH = 200;

const FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i;

const validateScreenshotPath = (path, requestId) => {
  if (!path || typeof path !== 'string') {
    return { ok: false, error: 'screenshot_url is required.' };
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return { ok: false, error: 'screenshot_url is required.' };
  }

  if (trimmed.length > MAX_PATH_LENGTH) {
    return { ok: false, error: 'screenshot path is too long.' };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: 'Send the storage path from upload, not a URL.' };
  }

  if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.startsWith('/')) {
    return { ok: false, error: 'Invalid screenshot path.' };
  }

  const prefix = `${requestId}/`;
  if (!trimmed.startsWith(prefix)) {
    return { ok: false, error: 'Screenshot path must belong to this order.' };
  }

  const filename = trimmed.slice(prefix.length);
  if (!FILENAME_PATTERN.test(filename)) {
    return { ok: false, error: 'screenshot must be .jpg, .jpeg, .png, or .webp.' };
  }

  return { ok: true, path: trimmed };
};

const isStoragePath = (path) => {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  return !/^https?:\/\//i.test(trimmed)
    && !trimmed.includes('..')
    && !trimmed.includes('\\')
    && !trimmed.startsWith('/')
    && /^[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(trimmed);
};

module.exports = {
  validateScreenshotPath,
  isStoragePath,
  MAX_PATH_LENGTH,
};
