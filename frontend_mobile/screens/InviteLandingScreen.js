import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import LoadingState from '../components/LoadingState';
import theme from '../constants/theme';
import { lookupInvite, possessiveName } from '../utils/inviteLink';

export default function InviteLandingScreen({ code, onGetStarted, onExistingAccount, onNotNow }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    lookupInvite(code)
      .then((result) => {
        if (!active) return;
        const display = result?.display_name;
        if (!display) {
          setError('Invite not found.');
          return;
        }
        setName(display);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Invite not found.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (loading) {
    return <LoadingState message="Opening invite…" />;
  }

  if (error) {
    return (
      <View style={styles.onboard}>
        <Text style={styles.kicker}>Invite</Text>
        <Text style={styles.title}>{error}</Text>
        <View style={styles.actions}>
          <PrimaryButton label="Continue" onPress={onNotNow} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.onboard}>
      <Text style={styles.kicker}>You’re invited</Text>
      <Text style={styles.title}>Join {possessiveName(name)} circle</Text>
      <Text style={styles.body}>
        Friends and family request a bank-card discount on online orders. Whoever has the card places the order and earns a share. Whoever doesn’t, saves.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Get started" onPress={onGetStarted} />
        <SecondaryButton label="I already have an account" onPress={onExistingAccount} />
        <SecondaryButton label="Not now" onPress={onNotNow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  onboard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.screenPadding,
    paddingVertical: theme.spacing.xxl,
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.display,
    letterSpacing: -1,
    lineHeight: theme.lineHeight.display,
    textAlign: 'center',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text2,
    textAlign: 'center',
    marginBottom: 36,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.section,
  },
});
