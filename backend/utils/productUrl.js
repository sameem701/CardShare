// Keep this in step with frontend_mobile/utils/productUrl.js.
const PRODUCT_URL_PATTERN = /^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}([/?#][^\s]*)?$/i;

const PRODUCT_URL_ERROR =
  'Product link must start with http:// or https://, contain no spaces, and use a site name that ends in letters such as .pk or .com.';

function isProductUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return !/\s/.test(raw) && PRODUCT_URL_PATTERN.test(raw);
}

function normalizeProductUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!isProductUrl(raw)) {
    const error = new Error(PRODUCT_URL_ERROR);
    throw error;
  }
  return raw;
}

module.exports = {
  PRODUCT_URL_ERROR,
  isProductUrl,
  normalizeProductUrl,
};
