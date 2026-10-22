import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { cancelCircleInvite, getCircle, respondToCircleInvite, removeFromCircle } from '../api/circle';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import SecondaryButton from '../components/SecondaryButton';
import TopBar from '../components/TopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { useAppActions } from '../navigation/AppActions';
import { openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { contactNamesByPhone } from '../utils/deviceContacts';
import { asList } from '../utils/format';
import { normalizePhone } from '../utils/phone';

function shownName(member, localNames) {
  if (member.contact_name) return member.contact_name;
  if (member.c_status === 'pending' && !member.is_sender) {
    const local = localNames[normalizePhone(member.phone)];
    if (local) return local;
  }
  return member.display_name || 'Unknown';
}

function CrossIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M7 7l10 10M17 7L7 17" stroke={theme.colors.text2} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

function BinIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={theme.colors.red} strokeWidth="2" strokeLinecap="round" />
      <Path d="M9 7V5h6v2" stroke={theme.colors.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6.5 7l1 13h9l1-13" stroke={theme.colors.red} strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}

function circleBadge(member) {
  if (member.c_status === 'accepted') return null;
  if (member.c_status === 'declined') return { label: 'Declined', variant: 'gray' };
  return { label: 'Pending', variant: 'amber' };
}

export default function CircleScreen() {
  const navigation = useNavigation();
  const { openMenu } = useAppActions();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [workingId, setWorkingId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [actionError, setActionError] = useState('');
  const [localNames, setLocalNames] = useState({});

  const circle = useScreenQuery(
    ['circle', user?.id],
    async ({ signal, client }) => {
      try {
        const rows = await getCircle(sessionId, user.id, { signal });
        return asList(rows);
      } catch (err) {
        if (signal?.aborted) throw err;
        const previous = client.getQueryData(['circle', user.id]);
        if (previous) throw err;
        throw err;
      }
    }
  );
  const members = circle.data || [];
  const error = actionError || (circle.data ? '' : circle.errorMessage) || (circle.isError ? circle.errorMessage : '');

  useEffect(() => {
    const phones = (circle.data || [])
      .filter((member) => member.c_status === 'pending' && !member.is_sender && !member.contact_name)
      .map((member) => member.phone);
    if (!phones.length) return undefined;
    let cancelled = false;
    contactNamesByPhone(phones)
      .then((names) => {
        if (!cancelled) setLocalNames(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [circle.data]);

  const respond = async (friendId, status, contactName) => {
    setWorkingId(friendId);
    setActionError('');
    try {
      await respondToCircleInvite(sessionId, user.id, friendId, status, contactName);
      setConfirm(null);
      showToast(status === 'accepted' ? 'Invite accepted' : 'Invite declined');
      await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorkingId(null);
    }
  };

  const cancel = async (friendId) => {
    setWorkingId(friendId);
    setActionError('');
    try {
      await cancelCircleInvite(sessionId, user.id, friendId);
      showToast('Invite cancelled');
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
    } catch (err) {
      setConfirm(null);
      setActionError(err.message);
      await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
    } finally {
      setWorkingId(null);
    }
  };

  const remove = async (friendId) => {
    setWorkingId(friendId);
    setActionError('');
    try {
      await removeFromCircle(sessionId, user.id, friendId);
      showToast('Removed from circle');
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <ScreenShell
      onRefresh={() => circle.refetch()}
      refreshing={circle.refreshing}
    >
      <TopBar
        title="Trusted Circle"
        displayName={user.display_name}
        onAccount={openMenu}
        actionLabel="+ Add"
        onAction={() => openScreen(navigation, 'add-circle')}
      />
      {circle.showLoading ? (
        <LoadingState />
      ) : members.length === 0 && !error ? (
        <View style={styles.pad}>
          <EmptyState message="No one in your circle yet. Add someone you trust." />
        </View>
      ) : (
        members.map((member) => {
          const badge = circleBadge(member);
          const pendingReceived = member.c_status === 'pending' && !member.is_sender;
          const pendingSent = member.c_status === 'pending' && member.is_sender;
          const name = shownName(member, localNames);
          return (
            <View key={member.id} style={styles.member}>
              <ListCard
                title={name}
                subtitle={member.phone || ''}
                badgeLabel={badge?.label}
                badgeVariant={badge?.variant}
                action={member.c_status === 'accepted' ? (
                  <Pressable
                    style={styles.bin}
                    hitSlop={8}
                    disabled={workingId === member.id}
                    onPress={() =>
                      setConfirm({
                        title: 'Remove from circle?',
                        body: `${name} will no longer share cards with you.`,
                        confirmLabel: 'Remove',
                        onConfirm: () => remove(member.id),
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Remove"
                  >
                    <BinIcon />
                  </Pressable>
                ) : pendingSent ? (
                  <Pressable
                    hitSlop={8}
                    disabled={workingId === member.id}
                    onPress={() =>
                      setConfirm({
                        title: 'Cancel this invite?',
                        body: `${name} will not be asked to join your circle.`,
                        confirmLabel: 'Cancel invite',
                        onConfirm: () => cancel(member.id),
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Cancel invite"
                  >
                    <CrossIcon />
                  </Pressable>
                ) : null}
              />
              {pendingReceived ? (
                <View style={styles.actions}>
                  <PrimaryButton
                    label="Accept"
                    loading={workingId === member.id}
                    onPress={async () => {
                      const names = await contactNamesByPhone([member.phone]);
                      respond(member.id, 'accepted', names[normalizePhone(member.phone)] || null);
                    }}
                  />
                  <SecondaryButton
                    label="Decline"
                    disabled={workingId === member.id}
                    onPress={() =>
                      setConfirm({
                        title: 'Decline this invite?',
                        body: `${name} will not join your circle.`,
                        confirmLabel: 'Decline',
                        onConfirm: () => respond(member.id, 'declined'),
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          );
        })
      )}
      <View style={styles.pad}>
        <ErrorBanner message={error} onRetry={() => circle.refetch()} />
      </View>
      <ConfirmDialog
        visible={Boolean(confirm)}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        danger
        loading={Boolean(workingId)}
        onCancel={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
  member: {
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
    gap: theme.spacing.sm,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  bin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.redDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
