import { Pressable, StyleSheet, Text } from 'react-native';
import theme from '../constants/theme';

export default function SecondaryButton({ label, onPress, disabled, danger, compact }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        danger && styles.danger,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.text, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  compact: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  danger: {
    borderColor: theme.colors.red,
    backgroundColor: theme.colors.redDim,
  },
  pressed: {
    backgroundColor: theme.colors.bg4,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
  dangerText: {
    color: theme.colors.red,
  },
});
