import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import theme from '../constants/theme';
import { useTopInset } from '../hooks/useTopInset';
import { initialsFor } from '../utils/initials';

export function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 6L8 12l7 6" stroke={theme.colors.text} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function TopBar({ title, displayName, onBack, onAccount, actionLabel, onAction }) {
  const topInset = useTopInset();
  return (
    <View style={[styles.bar, { paddingTop: topInset }]}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon />
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
            style={({ pressed }) => [styles.avatar, pressed && onAccount && styles.avatarPressed]}
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.greenDim,
    borderWidth: 1,
    borderColor: theme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressed: {
    backgroundColor: 'rgba(0, 200, 122, 0.28)',
  },
  avatarText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.green,
  },
  backBtn: {
    paddingVertical: theme.spacing.xs,
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
    width: 44,
  },
});
