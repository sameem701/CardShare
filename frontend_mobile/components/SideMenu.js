import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useTopInset } from '../hooks/useTopInset';
import { formatDisplayName } from '../utils/initials';
import ConfirmDialog from './ConfirmDialog';
import { PanelIcon } from './NavIcons';

function MenuIcon({ name, color = theme.colors.text2, size = 22 }) {
  if (name === 'circle') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.8" />
        <Circle cx="17" cy="9" r="2.4" stroke={color} strokeWidth="1.8" />
        <Path d="M3.5 19c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5M15 15c2.8-.2 4.5 1.1 5 3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }
  if (name === 'history') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.8" />
        <Path d="M12 8v4l3 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (name === 'settings') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Path d="M19.4 13c.04-.33.06-.66.06-1s-.02-.67-.06-1l1.9-1.48a.48.48 0 0 0 .11-.61l-1.8-3.12a.48.48 0 0 0-.58-.21l-2.24.9a6.7 6.7 0 0 0-1.53-.88l-.34-2.39A.48.48 0 0 0 14.5 2.8h-5a.48.48 0 0 0-.47.4l-.34 2.39c-.56.22-1.08.52-1.53.88l-2.24-.9a.48.48 0 0 0-.58.21L2.54 8.9a.48.48 0 0 0 .11.61L4.55 11c-.04.33-.06.66-.06 1s.02.67.06 1l-1.9 1.48a.48.48 0 0 0-.11.61l1.8 3.12c.13.23.41.32.64.21l2.24-.9c.45.36.97.66 1.53.88l.34 2.39c.05.23.24.4.47.4h5c.23 0 .42-.17.47-.4l.34-2.39c.56-.22 1.08-.52 1.53-.88l2.24.9c.23.1.51.02.64-.21l1.8-3.12a.48.48 0 0 0-.11-.61L19.4 13ZM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4Z" />
      </Svg>
    );
  }
  if (name === 'guide') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.8" />
        <Path d="M12 11v5" stroke={color} strokeWidth="1.8" />
        <Circle cx="12" cy="8" r="1" fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Item({ icon, label, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MenuIcon name={icon} />
      <Text style={styles.itemText}>{label}</Text>
    </Pressable>
  );
}

export default function SideMenu({ visible, onClose, onCircle, onHistory, onSettings, onHowItWorks, onLoggedOut }) {
  const { user, signOut } = useSession();
  const topInset = useTopInset();
  const { width: windowWidth } = useWindowDimensions();
  const phoneWidth = Math.min(windowWidth, theme.layout.phoneWidth);
  const drawerWidth = Math.min(theme.layout.menuWidth, Math.round(phoneWidth * 0.82));
  const progress = useRef(new Animated.Value(0)).current;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    progress.setValue(0);
    const animation = Animated.spring(progress, {
      toValue: 1,
      ...theme.motion.sheet,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, progress]);

  const logout = async () => {
    setWorking(true);
    setError('');
    try {
      await signOut();
      onLoggedOut();
    } catch (err) {
      setError(err.message);
      setWorking(false);
      setConfirmLogout(false);
    }
  };

  if (!visible) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth - 16, 0],
  });

  return (
    <View style={styles.host}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.card,
            { width: drawerWidth, transform: [{ translateX }] },
          ]}
        >
          <View style={[styles.who, { paddingTop: topInset + 6 }]}>
            <View style={styles.whoText}>
              <Text style={styles.name} numberOfLines={1}>{formatDisplayName(user?.display_name) || 'Account'}</Text>
              {user?.city ? <Text style={styles.city} numberOfLines={1}>{user.city}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.iconPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <PanelIcon color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.nav}>
            <Item icon="circle" label="Trusted Circle" onPress={onCircle} />
            <Item icon="history" label="History" onPress={onHistory} />
            <Item icon="settings" label="Settings" onPress={onSettings} />
            <Item icon="guide" label="How it works" onPress={onHowItWorks} />
          </ScrollView>
          <View style={styles.foot}>
            <Pressable
              style={({ pressed }) => [styles.out, pressed && styles.outPressed]}
              onPress={() => setConfirmLogout(true)}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <MenuIcon name="logout" color={theme.colors.red} />
              <Text style={styles.outText}>Log out</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </Animated.View>
      </View>
      <ConfirmDialog
        visible={confirmLogout}
        title="Log out?"
        confirmLabel="Confirm"
        loading={working}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={logout}
      />
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
    zIndex: 100,
    alignItems: 'center',
  },
  backdrop: {
    flex: 1,
    width: '100%',
    maxWidth: theme.layout.phoneWidth,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.overlay,
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  card: {
    height: '100%',
    backgroundColor: theme.colors.bg,
    borderRightWidth: 1,
    borderColor: theme.colors.border2,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  whoText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
  },
  name: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: theme.colors.text,
  },
  city: {
    marginTop: 6,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.text3,
  },
  close: {
    width: 44,
    height: 44,
    marginTop: -6,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  iconPressed: {
    transform: [{ scale: theme.motion.pressIcon }],
    opacity: 0.72,
  },
  nav: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: theme.radius.menu,
  },
  itemPressed: {
    backgroundColor: theme.colors.bg3,
  },
  itemText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 16,
    color: theme.colors.text,
  },
  foot: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  out: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: theme.radius.menu,
  },
  outPressed: {
    backgroundColor: theme.colors.redDim,
  },
  outText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 16,
    color: theme.colors.red,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.red,
    marginTop: theme.spacing.sm,
    paddingHorizontal: 12,
  },
});
