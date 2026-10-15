import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCircle, respondToCircleInvite, removeFromCircle } from '../api/circle';
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
import { asList } from '../utils/format';

function circleBadge(member) {
  if (member.c_status === 'accepted') return null;
  if (member.c_status === 'declined') return { label: 'Declined', variant: 'gray' };
  return { label: 'Pending', variant: 'amber' };
}

export default function CircleScreen({ activeTab, onTabPress, onNavigate }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await getCircle(sessionId, user.id);
      setMembers(asList(rows));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (friendId, status) => {
    setWorkingId(friendId);
    setError('');
    try {
      await respondToCircleInvite(sessionId, user.id, friendId, status);
      setConfirm(null);
      showToast(status === 'accepted' ? 'Invite accepted' : 'Invite declined');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorkingId(null);
    }
  };

  const remove = async (friendId) => {
    setWorkingId(friendId);
    setError('');
    try {
      await removeFromCircle(sessionId, user.id, friendId);
      showToast('Removed from circle');
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <ScreenShell
      withNav
      activeTab={activeTab}
      onTabPress={onTabPress}
      onRefresh={() => { setRefreshing(true); load(); }}
      refreshing={refreshing}
    >
      <TopBar
        title="Trusted Circle"
        actionLabel="+ Add"
        onAction={() => onNavigate('add-circle')}
      />
      {loading ? (
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
          return (
            <View key={member.id} style={styles.member}>
              <ListCard
                title={member.display_name || 'Unknown'}
                subtitle={member.phone || ''}
                badgeLabel={badge?.label}
                badgeVariant={badge?.variant}
                action={member.c_status === 'accepted' ? (
                  <Pressable
                    style={styles.remove}
                    disabled={workingId === member.id}
                    onPress={() =>
                      setConfirm({
                        title: 'Remove from circle?',
                        body: `${member.display_name || 'This person'} will no longer share cards with you.`,
                        confirmLabel: 'Remove',
                        onConfirm: () => remove(member.id),
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Remove"
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              />
              {pendingReceived ? (
                <View style={styles.actions}>
                  <PrimaryButton
                    label="Accept"
                    loading={workingId === member.id}
                    onPress={() => respond(member.id, 'accepted')}
                  />
                  <SecondaryButton
                    label="Decline"
                    disabled={workingId === member.id}
                    onPress={() =>
                      setConfirm({
                        title: 'Decline this invite?',
                        body: `${member.display_name || 'This person'} will not join your circle.`,
                        confirmLabel: 'Decline',
                        onConfirm: () => respond(member.id, 'declined'),
                      })
                    }
                  />
                </View>
              ) : null}
              {pendingSent ? (
                <Text style={styles.hint}>Invite sent — waiting for them.</Text>
              ) : null}
            </View>
          );
        })
      )}
      <View style={styles.pad}>
        <ErrorBanner message={error} onRetry={() => { setRefreshing(true); load(); }} />
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
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    paddingHorizontal: theme.spacing.xs,
  },
  remove: {
    borderWidth: 0.5,
    borderColor: theme.colors.red,
    backgroundColor: theme.colors.redDim,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  removeText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
  },
});
