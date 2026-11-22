import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { unreadLabel } from '../utils/format';

export default function PrimaryButton({ label, count, onPress, disabled, loading, compact, danger }) {
  const unread = unreadLabel(count);
  const accessibilityLabel = unread ? `${label}, ${unread} unread` : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        danger && styles.danger,
        pressed && !disabled && (danger ? styles.dangerPressed : styles.pressed),
        pressed && !disabled && { transform: [{ scale: theme.motion.press }] },
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      <View style={styles.row}>
        <Text style={[styles.text, danger && styles.dangerText]}>{loading ? 'Please wait…' : label}</Text>
        {unread && !loading ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{unread}</Text>
          </View>
        ) : null}
      </View>
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
  },
  danger: {
    backgroundColor: theme.colors.red,
  },
  dangerPressed: {
    backgroundColor: '#E04444',
  },
  dangerText: {
    color: theme.colors.white,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.black,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.white,
  },
});
