import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'cardcircle_session';

export async function readStoredSession() {
  if (Platform.OS === 'web') return AsyncStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

export async function writeStoredSession(value) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

export async function clearStoredSession() {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
