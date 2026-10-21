export function formatPkr(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return `PKR ${Number(amount).toLocaleString('en-PK')}`;
}

export function formatDate(ms) {
  if (!ms) return '';
  const date = new Date(Number(ms));
  return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(ms) {
  if (!ms) return '';
  return new Date(Number(ms)).toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function savingAmount(orderAmount, actualPaid) {
  if (orderAmount == null || actualPaid == null) return null;
  return Number(orderAmount) - Number(actualPaid);
}

export function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function unreadLabel(count) {
  const value = Number(count) || 0;
  if (value <= 0) return '';
  if (value > 9) return '+9';
  return String(value);
}

export function sharingOn(allowSharing) {
  return Number(allowSharing) === 1;
}
