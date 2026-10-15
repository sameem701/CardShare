import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useTopInset } from '../hooks/useTopInset';
import { initialsFor } from '../utils/initials';

export default function TopBar({ title, displayName, backLabel, onBack, onAccount, actionLabel, onAction }) {
  const topInset = useTopInset();
  return (
    <View style={[styles.bar, { paddingTop: topInset }]}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>{backLabel || '← Back'}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>
        {onAction ? (
          <Pressable onPress={onAction} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel={actionLabel}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
        {displayName ? (
          <Pressable
            onPress={onAccount}
            disabled={!onAccount}
            style={styles.avatar}
            accessibilityRole={onAccount ? 'button' : 'text'}
            accessibilityLabel={onAccount ? 'Account' : initialsFor(displayName)}
          >
            <Text style={styles.avatarText}>{initialsFor(displayName)}</Text>
          </Pressable>
        ) : !onAction ? (
          <View style={styles.spacer} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
    zIndex: 2,
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.avatar,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
  backBtn: {
    paddingVertical: theme.spacing.xs,
  },
  backText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  actionBtn: {
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actionText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.black,
  },
  spacer: {
    width: 38,
  },
});
