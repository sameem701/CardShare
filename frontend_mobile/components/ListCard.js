import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import Badge from './Badge';

export default function ListCard({ title, subtitle, badgeLabel, badgeVariant, action, onPress }) {
  const inner = (
    <>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {action || (badgeLabel ? <Badge label={badgeLabel} variant={badgeVariant} /> : null)}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.card}>{inner}</View>;
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.bg2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    ...theme.shadows.card,
  },
  pressed: {
    opacity: 0.9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    marginTop: theme.spacing.xs,
  },
});
