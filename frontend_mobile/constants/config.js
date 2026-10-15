import { Platform } from 'react-native';
import Constants from 'expo-constants';

function hostFromExpo() {
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = String(hostUri).split(':')[0];
  return host || '';
}

function resolveApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');
  if (Platform.OS !== 'web') {
    const host = hostFromExpo();
    if (host) return `http://${host}:3000`;
  }
  return 'http://localhost:3000';
}

export const API_BASE_URL = resolveApiBaseUrl();
