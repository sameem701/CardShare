import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId) => `cardshare_onboarding_tour_v1_${userId}`;

export async function readOnboardingTour(userId) {
  if (!userId) return 'done';
  try {
    const value = await AsyncStorage.getItem(keyFor(userId));
    return value === 'pending' ? 'pending' : 'done';
  } catch {
    return 'done';
  }
}

export async function markOnboardingPending(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(keyFor(userId), 'pending');
}

export async function markOnboardingDone(userId) {
  if (!userId) return;
  await AsyncStorage.setItem(keyFor(userId), 'done');
}
