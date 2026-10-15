import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'cardcircle_session';

export async function readStoredSession() {
  if (Platform.OS === 'web') return AsyncStorage.getItem(KEY);
  const secure = await SecureStore.getItemAsync(KEY);
  if (secure) return secure;
  const legacy = await AsyncStorage.getItem(KEY);
  if (legacy) {
    await SecureStore.setItemAsync(KEY, legacy);
    await AsyncStorage.removeItem(KEY);
  }
  return legacy;
}

export async function writeStoredSession(value) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
  await AsyncStorage.removeItem(KEY);
}

export async function clearStoredSession() {
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(KEY);
  }
  await AsyncStorage.removeItem(KEY);
}
