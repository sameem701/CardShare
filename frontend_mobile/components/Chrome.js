import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import theme from '../constants/theme';

export default function Chrome({ strong, style, children }) {
  const fallback = strong ? theme.colors.chromeStrong : theme.colors.chrome;
  if (Platform.OS === 'android') {
    return <View style={[{ backgroundColor: fallback }, style]}>{children}</View>;
  }
  return (
    <BlurView
      intensity={strong ? 48 : 36}
      tint="dark"
      style={[styles.blur, { backgroundColor: fallback }, style]}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  blur: {
    overflow: 'hidden',
  },
});
