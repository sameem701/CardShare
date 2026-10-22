import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { cancelCircleInvite, getCircle, respondToCircleInvite, removeFromCircle } from '../api/circle';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
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

function TickIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={theme.colors.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function circleBadge(member) {
  if (member.c_status === 'pending' && member.is_sender) return { label: 'Sent', variant: 'amber' };
  return null;
}

export default function CircleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { openMenu } = useAppActions();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [workingId, setWorkingId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [actionError, setActionError] = useState('');
  const [localNames, setLocalNames] = useState({});
  const [filter, setFilter] = useState('circle');

  useEffect(() => {
    if (route.params?.filter === 'pending' || route.params?.filter === 'circle') {
      setFilter(route.params.filter);
    }
  }, [route.params?.filter, route.params?.at]);

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
  const incoming = members.some((member) => member.c_status === 'pending' && !member.is_sender);
  const visible = members.filter((member) => (
    filter === 'pending' ? member.c_status === 'pending' : member.c_status === 'accepted'
  ));
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
      <View style={styles.filters}>
        {[['circle', 'Circle'], ['pending', 'Pending']].map(([id, label]) => {
          const selected = filter === id;
          const mark = id === 'pending' && incoming;
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={mark ? `${label}, invite waiting` : label}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={[styles.chipText, selected && styles.chipTextOn]}
              >
                {label}
              </Text>
              {mark ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>
      {circle.showLoading ? (
        <LoadingState />
      ) : visible.length === 0 && !error ? (
        <View style={styles.pad}>
          <EmptyState message={filter === 'pending' ? 'No pending invites.' : 'No one in your circle yet. Add someone you trust.'} />
        </View>
      ) : (
        visible.map((member) => {
          const badge = circleBadge(member);
          const pendingReceived = member.c_status === 'pending' && !member.is_sender;
          const pendingSent = member.c_status === 'pending' && member.is_sender;
          const name = shownName(member, localNames);
          return (
            <View key={member.id}>
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
                ) : pendingReceived ? (
                  <View style={styles.rowActions}>
                    <Pressable
                      style={styles.tick}
                      hitSlop={8}
                      disabled={workingId === member.id}
                      onPress={async () => {
                        const names = await contactNamesByPhone([member.phone]);
                        respond(member.id, 'accepted', names[normalizePhone(member.phone)] || null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Accept invite"
                    >
                      <TickIcon />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      disabled={workingId === member.id}
                      onPress={() =>
                        setConfirm({
                          title: 'Decline this invite?',
                          body: `${name} will not join your circle.`,
                          confirmLabel: 'Decline',
                          onConfirm: () => respond(member.id, 'declined'),
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Decline invite"
                    >
                      <CrossIcon />
                    </Pressable>
                  </View>
                ) : null}
              />
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.bg3,
    borderRadius: theme.radius.pill,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  chipOn: {
    backgroundColor: theme.colors.greenDim,
    borderColor: theme.colors.green,
  },
  chipText: {
    flexShrink: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  chipTextOn: {
    color: theme.colors.green,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.red,
  },
  bin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.redDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
