import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';

export function useTopInset() {
  const insets = useSafeAreaInsets();
  const base = Math.max(insets.top, theme.spacing.lg);
  if (Platform.OS === 'web') return base;
  return base + theme.spacing.xl;
}

export function useBottomInset() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, theme.spacing.lg);
}
