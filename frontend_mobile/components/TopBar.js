import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useTopInset } from '../hooks/useTopInset';
import BrandMark from './BrandMark';
import { initialsFor } from '../utils/initials';

export default function TopBar({ title, onProfile, displayName, backLabel, onBack, actionLabel, onAction }) {
  const topInset = useTopInset();
  return (
    <View style={[styles.bar, { paddingTop: topInset }]}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>{backLabel || '← Back'}</Text>
        </Pressable>
      ) : (
        <View style={styles.logo}>
          <BrandMark />
        </View>
      )}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {onAction ? (
        <Pressable onPress={onAction} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : onProfile ? (
        <Pressable onPress={onProfile} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Profile">
          <Text style={styles.avatarText}>{initialsFor(displayName)}</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
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
  logo: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.logo,
    backgroundColor: theme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    color: theme.colors.text,
    letterSpacing: -0.5,
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
