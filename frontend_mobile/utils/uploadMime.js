export function mimeFromExtension(ext) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return map[String(ext || 'jpg').toLowerCase()] || 'image/jpeg';
}
