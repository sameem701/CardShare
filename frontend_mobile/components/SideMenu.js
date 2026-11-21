import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useTopInset } from '../hooks/useTopInset';
import { formatDisplayName } from '../utils/initials';
import ConfirmDialog from './ConfirmDialog';
import { PanelIcon } from './NavIcons';

const MUTED = '#8A9099';

function MenuIcon({ name, color = MUTED, size = 21 }) {
  if (name === 'circle') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.8" />
        <Circle cx="17" cy="9" r="2.4" stroke={color} strokeWidth="1.8" />
        <Path d="M3.5 19c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5M15 15c2.8-.2 4.5 1.1 5 3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }
  if (name === 'cards') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x="3" y="5" width="18" height="14" rx="3" stroke={color} strokeWidth="1.8" />
        <Path d="M3 10h18" stroke={color} strokeWidth="1.8" />
      </Svg>
    );
  }
  if (name === 'profile') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="8" r="3.2" stroke={color} strokeWidth="1.8" />
        <Path d="M5.5 19.5c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
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

function Item({ icon, label, onPress, last }) {
  return (
    <Pressable
      style={[styles.item, !last && styles.itemDivider]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MenuIcon name={icon} />
      <Text style={styles.itemText}>{label}</Text>
    </Pressable>
  );
}

export default function SideMenu({ visible, onClose, onCircle, onCards, onHistory, onHowItWorks, onLoggedOut }) {
  const { user, signOut } = useSession();
  const topInset = useTopInset();
  const { width: windowWidth } = useWindowDimensions();
  const phoneWidth = Math.min(windowWidth, theme.layout.phoneWidth);
  const drawerWidth = Math.min(310, Math.round(phoneWidth * 0.84));
  const progress = useRef(new Animated.Value(0)).current;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
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
    outputRange: [-drawerWidth - 10, 0],
  });

  return (
    <View style={styles.host}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.card,
            { width: drawerWidth, paddingTop: topInset + 6, transform: [{ translateX }] },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.who}>
              <View style={styles.avatar}>
                <MenuIcon name="profile" color={theme.colors.green} size={23} />
              </View>
              <View style={styles.whoText}>
                <Text style={styles.name} numberOfLines={1}>{formatDisplayName(user?.display_name) || 'Account'}</Text>
                {user?.city ? <Text style={styles.city} numberOfLines={1}>{user.city}</Text> : null}
              </View>
              <Pressable
                onPress={onClose}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              >
                <PanelIcon color={theme.colors.text} />
              </Pressable>
            </View>

            <Text style={styles.label}>ACCOUNT</Text>
            <Item icon="cards" label="Manage Cards" onPress={onCards} />
            <Item icon="circle" label="Trusted Circle" onPress={onCircle} last />

            <Text style={styles.label}>ACTIVITY</Text>
            <Item icon="history" label="History" onPress={onHistory} last />

            <Text style={styles.label}>SUPPORT</Text>
            <Item icon="guide" label="How it works" onPress={onHowItWorks} last />

            <Pressable
              style={styles.out}
              onPress={() => setConfirmLogout(true)}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <MenuIcon name="logout" color={theme.colors.red} />
              <Text style={styles.outText}>Log out</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
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
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
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
    backgroundColor: theme.colors.bg2,
    borderRightWidth: 1,
    borderColor: theme.colors.border2,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 20,
  },
  content: {
    paddingBottom: 24,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg3,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  whoText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    color: theme.colors.text,
  },
  city: {
    marginTop: 2,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
  },
  close: {
    width: 38,
    height: 38,
    marginRight: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.3,
    color: theme.colors.text3,
    paddingTop: 18,
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 4,
  },
  itemDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  itemText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text2,
  },
  out: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  outText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.red,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.red,
    marginTop: theme.spacing.sm,
  },
});
