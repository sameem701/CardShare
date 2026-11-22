import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCircle, getInviteLink, sendCircleInvite } from '../../api/circle';
import { findUsersByPhones } from '../../api/profile';
import ErrorBanner from '../../components/ErrorBanner';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import SheetOverlay from '../../components/SheetOverlay';
import { BackIcon } from '../../components/TopBar';
import theme from '../../constants/theme';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';
import { useTopInset } from '../../hooks/useTopInset';
import { asList } from '../../utils/format';
import { initialsFor } from '../../utils/initials';
import { firstNameOf, inviteShareMessage, sendLinkInvite, shareInviteLink } from '../../utils/inviteLink';
import { listPhoneContacts } from '../../utils/deviceContacts';

function personName(row) {
  return row.contact_name || row.display_name || row.name || 'Someone';
}

export default function InviteFriendsScreen({ onBack, onSkip, linkInvite }) {
  const topInset = useTopInset();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [contactsOn, setContactsOn] = useState(false);
  const [matches, setMatches] = useState([]);
  const [sentIds, setSentIds] = useState({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [sharing, setSharing] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const pending = matches.filter((person) => !sentIds[person.id]);

  const checkContacts = async () => {
    setChecking(true);
    setError('');
    try {
      const listed = await listPhoneContacts();
      if (listed.unavailable) {
        setError('Contacts are not available on this device. Send an invite link instead.');
        return;
      }
      if (listed.denied) {
        setError(listed.blocked
          ? 'Allow Contacts in your phone Settings, or send an invite link.'
          : 'Contacts access is off. You can still send an invite link.');
        return;
      }
      const members = asList(await getCircle(sessionId, user.id));
      const already = {};
      const inCircle = new Set();
      members.forEach((member) => {
        if (member.c_status === 'accepted') inCircle.add(member.id);
        if (member.is_sender && member.c_status === 'pending') already[member.id] = true;
      });
      setSentIds(already);
      const found = asList(await findUsersByPhones(
        sessionId,
        user.id,
        listed.contacts.map((row) => row.phone)
      ));
      const named = found
        .filter((person) => !inCircle.has(person.id))
        .map((person) => {
          const local = listed.contacts.find((row) => row.phone === person.phone);
          return { ...person, contact_name: local?.name || person.display_name };
        });
      setMatches(named);
      setContactsOn(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const inviteOne = async (person) => {
    setError('');
    try {
      await sendCircleInvite(sessionId, user.id, person.id, person.contact_name, 'app');
      setSentIds((current) => ({ ...current, [person.id]: true }));
      showToast(`Request sent to ${String(personName(person)).split(/\s+/)[0]}. We'll tell you when they accept.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const inviteAll = async () => {
    setError('');
    try {
      await Promise.all(pending.map((person) => (
        sendCircleInvite(sessionId, user.id, person.id, person.contact_name, 'app')
      )));
      const next = { ...sentIds };
      pending.forEach((person) => { next[person.id] = true; });
      setSentIds(next);
      showToast(`Requests sent to ${pending.length} people. We'll tell you when they accept.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const openShare = async () => {
    setError('');
    try {
      const result = await getInviteLink(sessionId, user.id);
      setShareCode(result.code);
      setShareOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const doShare = async () => {
    setSharing(true);
    try {
      await shareInviteLink(user.display_name, shareCode);
      setShareOpen(false);
      showToast("Invite shared. We'll tell you when someone joins.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <View style={styles.top}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon />
        </Pressable>
        <Text style={styles.heading}>Invite friends & family</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        {linkInvite?.inviter_id && (linkInvite.status === 'can_send' || linkInvite.status === 'already_sent') ? (
          <View style={styles.linkInvite}>
            <Text style={styles.emptyTitle}>{firstNameOf(linkInvite.display_name)} invited you.</Text>
            <Text style={styles.emptyText}>
              {linkInvite.status === 'already_sent' || linkSent
                ? 'That invite was already sent.'
                : `Send a request to join ${firstNameOf(linkInvite.display_name)}’s circle. They will see it on Pending.`}
            </Text>
            {linkInvite.status === 'already_sent' || linkSent ? (
              <Text style={styles.badge}>Requested</Text>
            ) : (
              <PrimaryButton
                label="Send invite now"
                onPress={async () => {
                  setError('');
                  try {
                    await sendLinkInvite(sessionId, user.id, linkInvite.inviter_id);
                    setLinkSent(true);
                    showToast(`Request sent to ${firstNameOf(linkInvite.display_name)}.`);
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              />
            )}
          </View>
        ) : null}
        {!contactsOn ? (
          <>
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Find people you know</Text>
              <Text style={styles.emptyText}>
                Find out which of your contacts are already on CardShare.
              </Text>
              <PrimaryButton
                label={checking ? 'Please wait…' : 'Check contacts'}
                loading={checking}
                onPress={checkContacts}
              />
            </View>
            <Text style={styles.or}>or</Text>
            <SecondaryButton label="Send invite link" onPress={openShare} />
          </>
        ) : (
          <>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>{pending.length ? 'Already on CardShare' : 'Requests sent'}</Text>
              {pending.length > 1 ? (
                <Pressable onPress={inviteAll} accessibilityRole="button">
                  <Text style={styles.addAll}>Add all</Text>
                </Pressable>
              ) : null}
            </View>
            {matches.length === 0 ? (
              <Text style={styles.emptyText}>None of your contacts are on CardShare yet.</Text>
            ) : matches.map((person) => (
              <View key={person.id} style={styles.prow}>
                <View style={styles.av}>
                  <Text style={styles.avText}>{initialsFor(personName(person))}</Text>
                </View>
                <Text style={styles.pname}>{personName(person)}</Text>
                {sentIds[person.id] ? (
                  <Text style={styles.badge}>Requested</Text>
                ) : (
                  <Pressable
                    style={styles.add}
                    onPress={() => inviteOne(person)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${personName(person)}`}
                  >
                    <Text style={styles.addText}>Add</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <View style={styles.linkbox}>
              <Text style={styles.groupTitle}>Not on CardShare yet?</Text>
              <Text style={styles.emptyText}>Send them a link on WhatsApp or anywhere you like.</Text>
              {pending.length ? (
                <SecondaryButton label="Send invite link" onPress={openShare} />
              ) : (
                <PrimaryButton label="Send invite link" onPress={openShare} />
              )}
            </View>
          </>
        )}
        <Pressable onPress={onSkip} style={styles.skip} accessibilityRole="button">
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>

      <SheetOverlay visible={shareOpen} onClose={() => setShareOpen(false)}>
        <Text style={styles.sheetTitle}>Your invite</Text>
        <Text style={styles.msg}>
          {inviteShareMessage(user.display_name, shareCode)}
        </Text>
        <View style={styles.acts}>
          <SecondaryButton label="Close" onPress={() => setShareOpen(false)} />
          <PrimaryButton label={sharing ? 'Please wait…' : 'Share'} loading={sharing} onPress={doShare} />
        </View>
      </SheetOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  back: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.text,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  empty: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: 20,
    gap: 10,
  },
  linkInvite: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,200,122,0.35)',
  },
  emptyTitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 16,
    color: theme.colors.text,
  },
  emptyText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 20,
    color: theme.colors.text2,
  },
  or: {
    textAlign: 'center',
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  groupTitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addAll: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
  prow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  av: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 12,
    color: theme.colors.greenDark,
  },
  pname: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  badge: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.green,
  },
  add: {
    backgroundColor: theme.colors.green,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.black,
  },
  linkbox: {
    marginTop: 8,
    gap: 10,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  skipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  sheetTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: 12,
  },
  msg: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 22,
    color: theme.colors.text2,
    marginBottom: 16,
  },
  acts: {
    gap: 10,
  },
});
