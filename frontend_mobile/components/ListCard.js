import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import Badge from './Badge';

function unreadLabel(count) {
  const value = Number(count) || 0;
  if (value <= 0) return '';
  if (value > 9) return '+9';
  return String(value);
}

export default function ListCard({ title, subtitle, badgeLabel, badgeVariant, action, unreadCount, yourTurn, onPress }) {
  const unread = unreadLabel(unreadCount);
  const label = [title, yourTurn ? 'your turn' : '', unread ? `${unread} unread` : ''].filter(Boolean).join(', ');
  const inner = (
    <>
      {yourTurn ? <View style={styles.turnEdge} /> : null}
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        {badgeLabel ? <Badge label={badgeLabel} variant={badgeVariant} /> : null}
        {action}
        {unread ? (
          <View style={styles.unread}>
            <Text style={styles.unreadText}>{unread}</Text>
          </View>
        ) : null}
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
        accessibilityLabel={label}
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
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  turnEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: theme.colors.green,
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
  unread: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.white,
  },
});
