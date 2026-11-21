import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { cancelCircleInvite, getCircle, getInviteLink, respondToCircleInvite, removeFromCircle } from '../api/circle';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import { CircleEmpty } from '../components/HomeParts';
import { ContactCheckRow, InviteGroup } from '../components/InviteLists';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { useContactCheck } from '../hooks/useContactCheck';
import { openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList } from '../utils/format';
import { shareInviteLink } from '../utils/inviteLink';
import { normalizePhone } from '../utils/phone';

const FILTERS = [['circle', 'Circle'], ['pending', 'Pending'], ['sent', 'Sent']];

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

// Your own name for them if you saved one, then the name they chose, then a fallback.
function accountName(member) {
  return member.contact_name || member.display_name || 'Unknown';
}

function rowSubtitle(member) {
  const phone = member.phone || '';
  if (member.invite_via === 'link') return phone ? `${phone} · via link` : 'via link';
  return phone;
}

export default function CircleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const focused = useIsFocused();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [workingId, setWorkingId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState('circle');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const wanted = route.params?.filter;
    if (wanted === 'pending' || wanted === 'circle' || wanted === 'sent') setFilter(wanted);
  }, [route.params?.filter, route.params?.at]);

  const circle = useScreenQuery(
    ['circle', user?.id],
    async ({ signal }) => asList(await getCircle(sessionId, user.id, { signal }))
  );
  const members = circle.data || [];
  const accepted = members.filter((member) => member.c_status === 'accepted');
  const received = members.filter((member) => member.c_status === 'pending' && !member.is_sender);
  const sent = members.filter((member) => member.c_status === 'pending' && member.is_sender);
  const error = actionError || (circle.data ? '' : circle.errorMessage) || (circle.isError ? circle.errorMessage : '');

  const contacts = useContactCheck(
    user?.id,
    circle.data ? received.map((member) => normalizePhone(member.phone)) : null,
    focused
  );

  // Each received invite sits in one list. A saved result is final, so it never moves.
  const inContacts = [];
  const outOfContacts = [];
  const unchecked = [];
  received.forEach((member) => {
    const key = normalizePhone(member.phone);
    if (!(key in contacts.results)) unchecked.push(member);
    else if (contacts.results[key]) inContacts.push({ member, name: contacts.results[key] });
    else outOfContacts.push(member);
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
    await queryClient.invalidateQueries({ queryKey: ['circle-cards', user.id] });
  };

  const respond = async (member, status, savedName) => {
    setWorkingId(member.id);
    setActionError('');
    try {
      await respondToCircleInvite(sessionId, user.id, member.id, status, savedName || null);
      contacts.forget(normalizePhone(member.phone));
      setConfirm(null);
      showToast(status === 'accepted' ? 'Invite accepted' : 'Invite declined');
      await invalidate();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorkingId(null);
    }
  };

  const cancel = async (member) => {
    setWorkingId(member.id);
    setActionError('');
    try {
      await cancelCircleInvite(sessionId, user.id, member.id);
      showToast('Invite cancelled');
      setConfirm(null);
      await invalidate();
    } catch (err) {
      setConfirm(null);
      setActionError(err.message);
      await invalidate();
    } finally {
      setWorkingId(null);
    }
  };

  const remove = async (member) => {
    setWorkingId(member.id);
    setActionError('');
    try {
      await removeFromCircle(sessionId, user.id, member.id);
      showToast('Removed from circle');
      setConfirm(null);
      await invalidate();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorkingId(null);
    }
  };

  const shareLink = async () => {
    setSharing(true);
    setActionError('');
    try {
      const result = await getInviteLink(sessionId, user.id);
      await shareInviteLink(user.display_name, result.code);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSharing(false);
    }
  };

  const toggleContacts = async () => {
    const outcome = await contacts.toggle();
    if (outcome === 'blocked') {
      Alert.alert(
        'Contacts access is off',
        'Your phone will not ask again. Allow Contacts for CardShare in Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
    } else if (outcome === 'denied') {
      showToast('Contacts check stays off');
    }
  };

  // savedName is set only for rows in "In your contacts". It is the name sent when accepting.
  const receivedRow = (member, name, savedName = null) => (
    <ListCard
      key={member.id}
      title={name}
      subtitle={rowSubtitle(member)}
      action={(
        <View style={styles.rowActions}>
          <Pressable
            style={styles.tick}
            hitSlop={8}
            disabled={workingId === member.id}
            onPress={() => respond(member, 'accepted', savedName)}
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
                onConfirm: () => respond(member, 'declined'),
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Decline invite"
          >
            <CrossIcon />
          </Pressable>
        </View>
      )}
    />
  );

  let body;
  if (circle.showLoading) {
    body = <LoadingState />;
  } else if (filter === 'circle') {
    body = accepted.length === 0 && !error ? (
      <CircleEmpty
        title="No one in your circle yet"
        text="Add someone you trust by their phone number. Invites you send or receive show up here."
        button="Add someone"
        onPress={() => openScreen(navigation, 'add-circle')}
      />
    ) : (
      accepted.map((member) => {
        const name = accountName(member);
        return (
          <ListCard
            key={member.id}
            title={name}
            subtitle={rowSubtitle(member)}
            action={(
              <Pressable
                style={styles.bin}
                hitSlop={8}
                disabled={workingId === member.id}
                onPress={() =>
                  setConfirm({
                    title: 'Remove from circle?',
                    body: `${name} will no longer share cards with you.`,
                    confirmLabel: 'Remove',
                    onConfirm: () => remove(member),
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Remove"
              >
                <BinIcon />
              </Pressable>
            )}
          />
        );
      })
    );
  } else if (filter === 'pending') {
    body = (
      <>
        <ContactCheckRow
          enabled={contacts.enabled}
          blocked={contacts.permission === 'blocked'}
          unavailable={contacts.permission === 'unavailable'}
          onPress={toggleContacts}
        />
        {contacts.error ? (
          <View style={styles.pad}>
            <ErrorBanner message={contacts.error} onRetry={contacts.retry} />
          </View>
        ) : null}
        {contacts.checking || !contacts.ready ? (
          <LoadingState />
        ) : (
          <>
            <InviteGroup title="In your contacts" count={inContacts.length}>
              {inContacts.map(({ member, name }) => receivedRow(member, name, name))}
            </InviteGroup>
            <InviteGroup title="Not in your contacts" count={outOfContacts.length}>
              {outOfContacts.map((member) => receivedRow(member, accountName(member)))}
            </InviteGroup>
            <InviteGroup title="Unchecked" count={unchecked.length}>
              {unchecked.map((member) => receivedRow(member, accountName(member)))}
            </InviteGroup>
          </>
        )}
      </>
    );
  } else {
    body = sent.length === 0 ? (
      <View style={styles.pad}>
        <EmptyState message="No invites sent." />
      </View>
    ) : (
      sent.map((member) => (
        <ListCard
          key={member.id}
          title={accountName(member)}
          subtitle={rowSubtitle(member)}
          badgeLabel="Sent"
          badgeVariant="amber"
          action={(
            <Pressable
              hitSlop={8}
              disabled={workingId === member.id}
              onPress={() =>
                setConfirm({
                  title: 'Cancel this invite?',
                  body: `${accountName(member)} will not be asked to join your circle.`,
                  confirmLabel: 'Cancel invite',
                  onConfirm: () => cancel(member),
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Cancel invite"
            >
              <CrossIcon />
            </Pressable>
          )}
        />
      ))
    );
  }

  return (
    <ScreenShell
      onRefresh={() => circle.refetch()}
      refreshing={circle.refreshing}
    >
      <TopBar
        title="Trusted Circle"
        onBack={() => navigation.goBack()}
        actionLabel="+ Add"
        onAction={() => openScreen(navigation, 'add-circle')}
      />
      <View style={styles.filters}>
        {FILTERS.map(([id, label]) => {
          const selected = filter === id;
          const mark = id === 'pending' && received.length > 0;
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
      <View style={styles.pad}>
        <Pressable
          onPress={shareLink}
          disabled={sharing}
          style={styles.shareBtn}
          accessibilityRole="button"
          accessibilityLabel="Share invite link"
        >
          <Text style={styles.shareText}>{sharing ? 'Preparing…' : 'Share invite link'}</Text>
        </Pressable>
      </View>
      {body}
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
  shareBtn: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  shareText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
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
