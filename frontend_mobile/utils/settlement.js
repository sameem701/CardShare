// 20% of the gap, nearest rupee. History uses the stored holder_share.
// A live proof has no stored share yet, so the same rounding is applied here.

function whole(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function holderShare(orderAmount, actualPaid) {
  const order = whole(orderAmount);
  const paid = whole(actualPaid);
  if (order == null || paid == null) return null;
  const gap = order - paid;
  if (gap < 0) return null;
  return Math.round(gap * 0.2);
}

export function recordedShare(record) {
  if (!record) return null;
  if (record.holder_share != null && record.holder_share !== '') {
    const share = whole(record.holder_share);
    if (share != null) return share;
  }
  return holderShare(record.order_amount, record.actual_amount_paid);
}

export function amountOwed(record) {
  const paid = whole(record?.actual_amount_paid);
  const share = recordedShare(record);
  if (paid == null || share == null) return null;
  return paid + share;
}

export function amountKept(record) {
  const order = whole(record?.order_amount);
  const owed = amountOwed(record);
  if (order == null || owed == null) return null;
  return order - owed;
}
