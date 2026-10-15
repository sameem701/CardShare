export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  if (digits.startsWith('92')) return `+${digits}`;
  if (String(value).trim().startsWith('+')) return `+${digits}`;
  return digits;
}
