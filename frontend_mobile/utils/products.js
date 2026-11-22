import { productUrlError } from './productUrl';

export function blankProduct(url = '', open = true) {
  return {
    key: `${Date.now()}-${Math.random()}`,
    title: '',
    url,
    note: '',
    qty: 1,
    open,
  };
}

export function productsFromApi(rows, fallbackUrl = '') {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length && fallbackUrl) {
    return [blankProduct(fallbackUrl, false)];
  }
  if (!list.length) return [blankProduct('', true)];
  return list.map((item, index) => ({
    key: String(item.id || `${index}-${item.title || item.product_url || ''}`),
    title: item.title || item.name || '',
    url: item.product_url || item.url || '',
    note: item.note || '',
    qty: Math.max(1, Math.min(99, Number(item.qty) || 1)),
    open: false,
  }));
}

export function cleanProductRows(items) {
  const cleaned = [];
  for (const item of items) {
    const title = String(item.title || item.name || '').trim();
    const url = String(item.url || item.product_url || '').trim();
    const note = String(item.note || '').trim();
    const qty = Math.max(1, Math.min(99, Number(item.qty) || 1));
    if (!title && !url && note) {
      return { error: 'Add a name or a link for the product with a note.' };
    }
    if (!title && !url) continue;
    const linkError = productUrlError(url);
    if (linkError) return { error: linkError };
    cleaned.push({
      title: title || null,
      product_url: url || null,
      note: note || null,
      qty,
    });
  }
  return { products: cleaned };
}
