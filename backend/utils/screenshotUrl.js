// Private Supabase bucket "screenshots": client uploads, sends storage PATH in screenshot_url.
// Supabase enforces jpeg/png/webp + 500KB on upload — not checked here.

const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;

const validateScreenshotUrl = (raw) => {
  const path = raw.trim();

  if (!path) {
    return { ok: false, error: 'screenshot_url is required.' };
  }

  if (path.includes('..') || path.startsWith('http')) {
    return { ok: false, error: 'Send the storage path from upload, not a URL.' };
  }

  if (path.length > 200) {
    return { ok: false, error: 'screenshot path is too long.' };
  }

  if (!ALLOWED_EXT.test(path)) {
    return { ok: false, error: 'screenshot must be .jpg, .jpeg, .png, or .webp.' };
  }

  return { ok: true, url: path };
};

module.exports = { validateScreenshotUrl };
