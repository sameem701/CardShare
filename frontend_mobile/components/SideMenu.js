import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useTopInset } from '../hooks/useTopInset';
import { loadHistory } from '../queries/history';
import { formatDisplayName } from '../utils/initials';
import ConfirmDialog from './ConfirmDialog';

function MenuIcon({ name, color, size = 22 }) {
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
        <Path d="M12 11v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <Circle cx="12" cy="8" r="1" fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 17l5-5-5-5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 12H9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export default function SideMenu({ visible, onClose, onHistory, onHowItWorks, onLoggedOut }) {
  const { sessionId, user, signOut } = useSession();
  const topInset = useTopInset();
  const history = useQuery({
    queryKey: ['history', user?.id],
    queryFn: ({ signal, client }) => loadHistory(sessionId, user.id, { signal, client }),
    enabled: Boolean(sessionId && user?.id),
  });
  const progress = useRef(new Animated.Value(0)).current;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return undefined;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 160,
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

  const finishedCount = (history.data?.asRequester?.length || 0) + (history.data?.asHolder?.length || 0);
  const showHistory = history.isError || Boolean(history.data?.error) || finishedCount > 0;
  const opacity = progress;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <View style={styles.host}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.card,
            { marginTop: topInset + 52, opacity, transform: [{ translateY }, { scale }] },
          ]}
        >
          <View style={styles.nameRow}>
            <MenuIcon name="profile" color={theme.colors.text} size={22} />
            <Text style={styles.name} numberOfLines={1}>{formatDisplayName(user?.display_name) || 'Account'}</Text>
          </View>
          {showHistory ? (
            <Pressable style={styles.row} onPress={onHistory} accessibilityRole="button" accessibilityLabel="History">
              <MenuIcon name="history" color={theme.colors.text2} size={22} />
              <Text style={styles.rowText}>History</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.row} onPress={onHowItWorks} accessibilityRole="button" accessibilityLabel="How it works">
            <MenuIcon name="guide" color={theme.colors.text2} size={22} />
            <Text style={styles.rowText}>How it works</Text>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => setConfirmLogout(true)}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <MenuIcon name="logout" color={theme.colors.red} size={22} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
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
    alignItems: 'flex-end',
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
    width: 236,
    marginRight: theme.layout.screenPadding,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    ...theme.shadows.card,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  name: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    color: theme.colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  rowText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text2,
  },
  logoutText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.red,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.red,
    marginBottom: theme.spacing.sm,
  },
});
