export function storeQueryFromUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const withProto = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\./i, '');
    const first = host.split('.')[0];
    return first || host;
  } catch {
    return text.replace(/\s+/g, ' ');
  }
}

function asInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function offerFromApply(row, store) {
  if (!row) return null;
  const offer = {
    store_id: asInt(store?.id ?? row.store_id),
    discount_percent: asInt(row.discount_percent),
    discount_flat_pkr: asInt(row.discount_flat_pkr),
    cap_pkr: asInt(row.cap_pkr),
    min_order_pkr: asInt(row.min_order_pkr),
    promo_code: row.promo_code ? String(row.promo_code).trim() : null,
    estimated_save_pkr: asInt(row.save_pkr ?? row.estimated_save_pkr),
  };
  const hasAny = Object.values(offer).some((value) => value != null && value !== '');
  return hasAny ? offer : null;
}

export function pickStoreMatch(stores, query) {
  const list = Array.isArray(stores) ? stores : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q || !list.length) return list[0] || null;
  const exact = list.find((store) => {
    const name = String(store.name || '').toLowerCase();
    const slug = String(store.slug || '').toLowerCase();
    return name === q || slug === q || slug.replace(/-/g, '') === q.replace(/-/g, '');
  });
  if (exact) return exact;
  return list.find((store) => {
    const name = String(store.name || '').toLowerCase();
    const slug = String(store.slug || '').toLowerCase();
    return name.includes(q) || slug.includes(q);
  }) || list[0];
}
