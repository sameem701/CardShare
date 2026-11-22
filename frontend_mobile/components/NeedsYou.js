import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { getCircle } from '../api/circle';
import Chrome from './Chrome';
import theme from '../constants/theme';
import { useRequestInbox } from '../context/RequestInbox';
import { useRoleMode } from '../context/RoleMode';
import { useSession } from '../context/SessionContext';
import { useTopInset } from '../hooks/useTopInset';
import { openCircle, openScreen } from '../navigation/openScreen';
import { asList } from '../utils/format';
import {
  needsYouCountLabel,
  needsYouGroupOrder,
  needsYouGroups,
  needsYouRows,
} from '../utils/needsYou';

function ExIcon({ color }) {
  return (
    <Svg width={14} height={22} viewBox="0 0 14 22" fill="none">
      <Path d="M7 2.5v10" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
      <Circle cx="7" cy="18" r="2" fill={color} />
    </Svg>
  );
}

function OkIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={theme.colors.text} strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

export default function NeedsYou({ visible, navigationRef }) {
  const { sessionId, user } = useSession();
  const { items } = useRequestInbox();
  const { mode, setMode } = useRoleMode();
  const topInset = useTopInset();
  const { width: windowWidth } = useWindowDimensions();
  const phoneWidth = Math.min(windowWidth, theme.layout.phoneWidth);
  const panelWidth = Math.round(phoneWidth * 0.86);

  const circle = useQuery({
    queryKey: ['circle', user?.id],
    queryFn: async ({ signal }) => asList(await getCircle(sessionId, user.id, { signal })),
    enabled: Boolean(sessionId && user?.id),
    staleTime: 30 * 1000,
  });
  const received = useMemo(
    () => (circle.data || []).filter((member) => member.c_status === 'pending' && !member.is_sender),
    [circle.data]
  );
  const liveRows = useMemo(() => needsYouRows(items, received), [items, received]);
  const liveKeys = liveRows.map((row) => row.key).join('|');
  const count = liveRows.length;
  const empty = count === 0;

  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState([]);
  const [frozen, setFrozen] = useState(null);
  const [newKeys, setNewKeys] = useState(() => new Set());
  const seen = useRef(new Set());
  const booted = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible && open) setOpen(false);
  }, [visible, open]);

  useEffect(() => {
    const keys = liveKeys ? liveKeys.split('|') : [];
    if (!booted.current) {
      keys.forEach((key) => seen.current.add(key));
      booted.current = true;
      return;
    }
    const grew = keys.some((key) => !seen.current.has(key));
    if (grew && keys.length) {
      pulse.setValue(0);
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [liveKeys, pulse]);

  useEffect(() => {
    if (!open) return undefined;
    progress.setValue(0);
    const animation = Animated.spring(progress, {
      toValue: 1,
      ...theme.motion.sheet,
    });
    animation.start();
    return () => animation.stop();
  }, [open, progress]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !open) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  const close = () => {
    shown.forEach((row) => seen.current.add(row.key));
    setNewKeys(new Set());
    setShown([]);
    setFrozen(null);
    setOpen(false);
  };

  const openPanel = () => {
    const fresh = new Set(liveRows.filter((row) => !seen.current.has(row.key)).map((row) => row.key));
    setNewKeys(fresh);
    setShown(liveRows);
    setFrozen(needsYouGroupOrder(mode));
    setOpen(true);
  };

  const go = (row) => {
    close();
    if (row.mode) setMode(row.mode);
    if (!navigationRef?.isReady?.()) return;
    if (row.nav?.screen === 'circle') {
      openCircle(navigationRef, { pending: true });
      return;
    }
    if (row.nav?.screen) openScreen(navigationRef, row.nav.screen, row.nav.params);
  };

  const groups = needsYouGroups(mode, shown, frozen);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth + 12, 0],
  });
  const fade = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 0],
  });
  const countText = needsYouCountLabel(count);
  const tabLabel = empty
    ? 'Needs you, nothing waiting'
    : `Needs you, ${count} ${count === 1 ? 'item' : 'items'}`;

  if (!visible && !open) return null;

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View pointerEvents="box-none" style={[styles.phone, { width: phoneWidth }]}>
        {visible ? (
          <Pressable
            onPress={open ? close : openPanel}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityLabel={tabLabel}
            accessibilityState={{ expanded: open }}
          >
            {!empty ? (
              <View style={styles.count}>
                <Text style={styles.countText}>{countText}</Text>
              </View>
            ) : null}
            <View style={[styles.shape, empty && styles.shapeEmpty]}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pulse,
                  empty && styles.pulseHidden,
                  { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
                ]}
              />
              {empty
                ? <OkIcon color={theme.colors.text2} />
                : <ExIcon color={theme.colors.ink} />}
            </View>
          </Pressable>
        ) : null}

        {open ? (
          <View style={styles.layer}>
            <Animated.View style={[styles.backdrop, { opacity: fade }]}>
              <Pressable style={styles.dismiss} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
            </Animated.View>
            <Animated.View
              style={[
                styles.panelHost,
                { width: panelWidth, transform: [{ translateX }] },
              ]}
            >
              <Chrome strong style={[styles.panel, { paddingTop: topInset + 8 }]}>
              <View style={styles.head}>
                <Text style={styles.title}>Needs you</Text>
                <Pressable
                  onPress={close}
                  style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <CloseIcon />
                </Pressable>
              </View>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                {groups.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>You’re all caught up</Text>
                    <Text style={styles.emptySub}>Nothing is waiting on you.</Text>
                  </View>
                ) : (
                  groups.map((group) => (
                    <View key={group.key} style={styles.group}>
                      <View style={styles.groupHead}>
                        <View style={[styles.dot, { backgroundColor: theme.colors[group.colorKey] }]} />
                        <Text style={[styles.groupLabel, { color: theme.colors[group.colorKey] }]}>{group.label}</Text>
                      </View>
                      {group.rows.map((row) => (
                        <Pressable
                          key={row.key}
                          onPress={() => go(row)}
                          style={({ pressed }) => [
                            styles.row,
                            pressed && styles.rowPressed,
                            pressed && { transform: [{ scale: theme.motion.press }] },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${newKeys.has(row.key) ? 'New. ' : ''}${row.verb}. ${row.title}. ${row.sub}`}
                        >
                          {newKeys.has(row.key) ? <Text style={styles.fresh}>New</Text> : null}
                          <View style={styles.line}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
                            <Text style={styles.verb}>{row.verb}</Text>
                          </View>
                          <Text style={styles.rowSub} numberOfLines={1}>{row.sub}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
              </Chrome>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 35,
    alignItems: 'center',
  },
  phone: {
    flex: 1,
    maxWidth: theme.layout.phoneWidth,
    position: 'relative',
  },
  tab: {
    position: 'absolute',
    right: 0,
    top: '46%',
    width: 44,
    height: 64,
    zIndex: 20,
    overflow: 'visible',
  },
  count: {
    position: 'absolute',
    right: 0,
    top: -8,
    zIndex: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.bg,
  },
  countText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 12,
    color: theme.colors.countInk,
  },
  shape: {
    position: 'absolute',
    right: 0,
    top: 4,
    width: 30,
    height: 56,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    backgroundColor: theme.colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  shapeEmpty: {
    backgroundColor: theme.colors.bg4,
  },
  pulse: {
    position: 'absolute',
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.colors.amber,
  },
  pulseHidden: {
    opacity: 0,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 35,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  dismiss: {
    flex: 1,
  },
  panelHost: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  },
  panel: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border2,
  },
  closePressed: {
    backgroundColor: theme.colors.bg3,
    transform: [{ scale: theme.motion.pressIcon }],
  },
  rowPressed: {
    backgroundColor: theme.colors.bg3,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.text,
  },
  close: {
    width: 44,
    height: 44,
    marginTop: -6,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  group: {
    marginBottom: 8,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  row: {
    position: 'relative',
    backgroundColor: theme.colors.bg2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  fresh: {
    position: 'absolute',
    top: -8,
    right: 14,
    zIndex: 2,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.colors.green,
    color: theme.colors.ink,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
  verb: {
    flexGrow: 0,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: theme.colors.amberDim,
    color: theme.colors.amber,
  },
  rowSub: {
    marginTop: 3,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.text2,
  },
  empty: {
    marginTop: 48,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.text2,
  },
});
