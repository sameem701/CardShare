import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { formatDisplayName } from '../utils/initials';

export default function ProfileScreen({ onBack, onLoggedOut }) {
  const { user, signOut } = useSession();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const logout = async () => {
    setWorking(true);
    setError('');
    try {
      await signOut();
      onLoggedOut();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title="Profile" onBack={onBack} />
      <View style={styles.pad}>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{formatDisplayName(user.display_name) || '—'}</Text>
        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>{user.phone}</Text>
      </View>
      <PrimaryButton label="Log out" loading={working} onPress={() => setConfirmLogout(true)} />
      <ErrorBanner message={error} />
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing.sm,
  },
  value: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
});
