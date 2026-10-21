function resolveApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (!fromEnv || !String(fromEnv).trim()) {
    throw new Error('EXPO_PUBLIC_API_URL is not set.');
  }
  return String(fromEnv).replace(/\/$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl();
