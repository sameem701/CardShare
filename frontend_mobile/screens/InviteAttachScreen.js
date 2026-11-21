import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import LoadingState from '../components/LoadingState';
import { resolveInviteLink } from '../api/circle';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { queryClient } from '../queries/client';
import { firstNameOf, possessiveName, sendLinkInvite } from '../utils/inviteLink';
import { clearPendingInviteCode } from '../utils/inviteHold';

export default function InviteAttachScreen({ code, onResolved, onFinished }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    resolveInviteLink(sessionId, user.id, code)
      .then((payload) => {
        if (!active) return;
        if (payload?.status === 'can_send') {
          setResult(payload);
          return;
        }
        onResolved(payload);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code, onResolved, sessionId, user.id]);

  const send = async () => {
    if (!result?.inviter_id) return;
    setSending(true);
    setError('');
    try {
      await sendLinkInvite(sessionId, user.id, result.inviter_id);
      await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
      clearPendingInviteCode();
      showToast('Invite sent');
      onFinished();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const skip = () => {
    clearPendingInviteCode();
    onFinished();
  };

  if (loading) {
    return <LoadingState message="Checking invite…" />;
  }

  if (!result) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{error || 'Invite not found.'}</Text>
        <PrimaryButton label="Continue" onPress={skip} />
      </View>
    );
  }

  const name = result.display_name;

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>Invite friends & family</Text>
      <Text style={styles.title}>{possessiveName(name)} invite</Text>
      <Text style={styles.body}>
        {firstNameOf(name)} invited you. Send a request to join their circle. They will see it on Pending.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Send invite now" loading={sending} onPress={send} />
      <View style={styles.gap} />
      <SecondaryButton label="Not now" onPress={skip} disabled={sending} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    fontSize: theme.fontSize.hero,
    lineHeight: theme.lineHeight.hero,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text2,
    marginBottom: theme.spacing.xxl,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
    marginBottom: theme.spacing.lg,
  },
  gap: {
    height: theme.spacing.section,
  },
});
