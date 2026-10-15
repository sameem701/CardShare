import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again">
          <Text style={styles.retry}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.redDim,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  text: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
  },
  retry: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
});
