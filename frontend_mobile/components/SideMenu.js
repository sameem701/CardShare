import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useTopInset } from '../hooks/useTopInset';
import { formatDisplayName } from '../utils/initials';
import ConfirmDialog from './ConfirmDialog';

export default function SideMenu({ visible, onClose, onHistory, onLoggedOut }) {
  const { user, signOut } = useSession();
  const topInset = useTopInset();
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
          <Text style={styles.name}>{formatDisplayName(user?.display_name) || 'Account'}</Text>
          <Pressable style={styles.row} onPress={onHistory} accessibilityRole="button" accessibilityLabel="History">
            <Text style={styles.rowText}>History</Text>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => setConfirmLogout(true)}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Animated.View>
      </View>
      <ConfirmDialog
        visible={confirmLogout}
        title="Log out?"
        body="You will need a new code to sign in again."
        confirmLabel="Log out"
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
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  card: {
    width: 220,
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
  name: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  row: {
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  rowText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text2,
  },
  logoutText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.red,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.red,
    marginBottom: theme.spacing.sm,
  },
});
