import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useRoleMode } from '../context/RoleMode';
import { useRequestInbox } from '../context/RequestInbox';
import { useAppActions } from '../navigation/AppActions';
import { useTopInset } from '../hooks/useTopInset';
import { itemsForMode } from '../utils/orderBanner';
import Chrome from './Chrome';
import { PanelIcon } from './NavIcons';

const OPTIONS = [
  ['requester', 'Save'],
  ['holder', 'Share'],
];

function chatUnread(items, mode) {
  return itemsForMode(items, mode).reduce((sum, item) => sum + (Number(item.unreadCount) || 0), 0);
}

function countLabel(count) {
  if (count > 9) return '9+';
  return String(count);
}

export default function TabHeader() {
  const topInset = useTopInset();
  const { openMenu } = useAppActions();
  const { mode, setMode } = useRoleMode();
  const { items } = useRequestInbox();

  return (
    <Chrome style={[styles.bar, { paddingTop: topInset }]}>
      <Pressable
        onPress={openMenu}
        style={({ pressed }) => [styles.menuBtn, pressed && styles.iconPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <PanelIcon color={theme.colors.text} />
      </Pressable>
      <View style={styles.toggle} accessibilityRole="tablist">
        {OPTIONS.map(([id, label]) => {
          const selected = mode === id;
          const unread = chatUnread(items, id);
          const showBadge = unread > 0 && !selected;
          return (
            <Pressable
              key={id}
              onPress={() => setMode(id)}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabOn,
                pressed && { transform: [{ scale: theme.motion.press }] },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={showBadge ? `${label}, ${unread} unread chat` : label}
            >
              <Text numberOfLines={1} style={[styles.tabText, selected && styles.tabTextOn]}>{label}</Text>
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{countLabel(unread)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Chrome>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 5,
  },
  menuBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: {
    transform: [{ scale: theme.motion.pressIcon }],
    opacity: 0.72,
  },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    backgroundColor: theme.colors.bg3,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    minWidth: 0,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabOn: {
    backgroundColor: theme.colors.green,
  },
  tabText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.text2,
  },
  tabTextOn: {
    color: theme.colors.black,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: theme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 11,
    color: theme.colors.white,
  },
});
