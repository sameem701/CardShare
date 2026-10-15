import { Platform } from 'react-native';

const MAX_BYTES = 500 * 1024;

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function shrinkOnWeb(uri) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const maxEdge = 1600;
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const encode = (quality) =>
        new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
      (async () => {
        let quality = 0.85;
        let blob = await encode(quality);
        while (blob && blob.size > MAX_BYTES && quality > 0.4) {
          quality -= 0.15;
          blob = await encode(quality);
        }
        if (!blob) reject(new Error('Could not read that image.'));
        else resolve(blob);
      })();
    };
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = uri;
  });
}

export async function prepareImage(asset) {
  const uri = asset?.uri;
  if (!uri) throw new Error('Choose an image first.');

  let blob = await (await fetch(uri)).blob();
  let mime = asset.mimeType || blob.type || 'image/jpeg';

  if (Platform.OS === 'web' && blob.size > MAX_BYTES) {
    blob = await shrinkOnWeb(uri);
    mime = 'image/jpeg';
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    mime = 'image/jpeg';
  }

  if (!blob || blob.size > MAX_BYTES) {
    throw new Error('Image must be 500 KB or smaller.');
  }

  return { blob, mime, ext: extensionForMime(mime) };
}

export async function uploadBlobToSignedUrl(signedUrl, blob, mimeType) {
  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error('Image upload failed. Try again.');
  }
}
