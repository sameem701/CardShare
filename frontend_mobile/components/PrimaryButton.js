import { Pressable, StyleSheet, Text } from 'react-native';
import theme from '../constants/theme';

export default function PrimaryButton({ label, onPress, disabled, loading, compact }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        pressed && !disabled && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      <Text style={styles.text}>{loading ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.control,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  compact: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  pressed: {
    backgroundColor: theme.colors.greenDark,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.black,
  },
});
