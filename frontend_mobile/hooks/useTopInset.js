import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';

export function useTopInset() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, theme.spacing.lg);
}

export function useBottomInset() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, theme.spacing.lg);
}
