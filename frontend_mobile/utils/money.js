export function wholePkrFromInput(value) {
  const raw = String(value ?? '');
  if (/[.,]/.test(raw)) {
    return { amount: raw.split(/[.,]/)[0].replace(/\D/g, ''), rejectedDecimal: true };
  }
  return { amount: raw.replace(/\D/g, ''), rejectedDecimal: false };
}

export function parseWholePkr(value) {
  const parsed = wholePkrFromInput(value);
  if (parsed.rejectedDecimal) return null;
  if (!/^\d+$/.test(parsed.amount)) return null;
  return Number(parsed.amount);
}
