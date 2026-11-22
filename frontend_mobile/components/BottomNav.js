import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useRequestInbox } from '../context/RequestInbox';
import { useRoleMode } from '../context/RoleMode';
import { useBottomInset } from '../hooks/useTopInset';
import { itemsForMode } from '../utils/orderBanner';
import { isYourTurn } from '../utils/requestInbox';
import Chrome from './Chrome';
import { NavIcon } from './NavIcons';

function unreadLabel(count) {
  const value = Number(count) || 0;
  if (value <= 0) return '';
  if (value > 9) return '+9';
  return String(value);
}

export default function BottomNav({ state, navigation }) {
  const bottomInset = useBottomInset();
  const { items } = useRequestInbox();
  const { mode } = useRoleMode();
  const tabs = [
    ['Home', 'home', 'Home'],
    ['Request', 'request', mode === 'holder' ? 'Orders' : 'Requests'],
  ];
  const visible = itemsForMode(items, mode);
  const yourTurn = visible.some(isYourTurn);
  const unread = unreadLabel(visible.reduce((sum, item) => sum + (Number(item.unreadCount) || 0), 0));
  const activeName = state.routes[state.index]?.name;
  return (
    <Chrome style={[styles.nav, { paddingBottom: bottomInset }]}>
      {tabs.map(([routeName, icon, label]) => {
        const active = routeName === activeName;
        const color = active ? theme.colors.green : theme.colors.text3;
        const showTurn = routeName === 'Request' && yourTurn;
        const showUnread = routeName === 'Request' && unread;
        let accessibilityLabel = label;
        if (showTurn) accessibilityLabel += ', needs you';
        if (showUnread) accessibilityLabel += `, ${unread} unread`;
        return (
          <Pressable
            key={routeName}
            style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: theme.motion.press }] }]}
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
    </Chrome>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
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
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.red,
  },
  unread: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.green,
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
