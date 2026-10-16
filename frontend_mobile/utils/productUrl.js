// Optional product link. Blank is allowed.
// A filled value must be http(s), have no spaces, and use a site name
// whose last part is at least two letters (.pk, .com, .com.pk, and so on).
const PRODUCT_URL_PATTERN = /^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}([/?#][^\s]*)?$/i;

export const PRODUCT_URL_ERROR =
  'Product link must start with http:// or https://, contain no spaces, and use a site name that ends in letters such as .pk or .com.';

export function isProductUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return !/\s/.test(raw) && PRODUCT_URL_PATTERN.test(raw);
}

export function productUrlError(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return isProductUrl(raw) ? '' : PRODUCT_URL_ERROR;
}
