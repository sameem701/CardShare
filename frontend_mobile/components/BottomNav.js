import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useRequestInbox } from '../context/RequestInbox';
import { useBottomInset } from '../hooks/useTopInset';
import { NavIcon } from './NavIcons';

function unreadLabel(count) {
  const value = Number(count) || 0;
  if (value <= 0) return '';
  if (value > 9) return '+9';
  return String(value);
}

const TABS = [
  ['Home', 'home', 'Home'],
  ['Request', 'request', 'Request'],
  ['Circle', 'circle', 'Circle'],
];

export default function BottomNav({ state, navigation }) {
  const bottomInset = useBottomInset();
  const { yourTurn, unreadTotal } = useRequestInbox();
  const unread = unreadLabel(unreadTotal);
  const activeName = state.routes[state.index]?.name;
  return (
    <View style={[styles.nav, { paddingBottom: bottomInset }]}>
      {TABS.map(([routeName, icon, label]) => {
        const active = routeName === activeName;
        const color = active ? theme.colors.green : theme.colors.text3;
        const showTurn = routeName === 'Request' && yourTurn;
        const showUnread = routeName === 'Request' && unread;
        let accessibilityLabel = label;
        if (showTurn) accessibilityLabel += ', your turn';
        if (showUnread) accessibilityLabel += `, ${unread} unread`;
        return (
          <Pressable
            key={routeName}
            style={styles.item}
            onPress={() => navigation.navigate(routeName)}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          >
            <View style={styles.iconWrap}>
              <NavIcon name={icon} color={color} />
              {showTurn ? <View style={styles.turnDot} /> : null}
              {showUnread ? (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  iconWrap: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnDot: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.green,
    borderWidth: 1.5,
    borderColor: theme.colors.bg,
  },
  unread: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.caption,
    color: theme.colors.white,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text3,
  },
  labelActive: {
    color: theme.colors.green,
  },
});
