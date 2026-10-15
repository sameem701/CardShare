function titleCaseWord(word) {
  if (!word) return '';
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatDisplayName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map(titleCaseWord).join(' ');
}

export function buildDisplayName(firstName, lastName) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  if (!first || !last) return '';
  return formatDisplayName(`${first} ${last}`);
}

export function initialsFor(name) {
  const formatted = formatDisplayName(name);
  const parts = formatted.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  if (parts.length === 1) {
    const word = parts[0];
    if (word.length >= 2) {
      return `${word[0]}${word[1]}`.toUpperCase();
    }
    return word[0].toUpperCase();
  }
  return '?';
}

export function cardholderNameLine(name) {
  const formatted = formatDisplayName(name);
  return formatted || 'Add your name';
}
