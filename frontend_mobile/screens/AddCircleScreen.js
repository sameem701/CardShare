import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import TextField from '../components/TextField';
import { sendCircleInvite } from '../api/circle';
import { findUserByPhone } from '../api/profile';
import ErrorBanner from '../components/ErrorBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import SecondaryButton from '../components/SecondaryButton';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { queryClient } from '../queries/client';
import { pickContact } from '../utils/deviceContacts';
import { firstNameOf } from '../utils/inviteLink';
import { normalizePhone } from '../utils/phone';

export default function AddCircleScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const fromLink = route.params?.inviteVia === 'link' && route.params?.inviterId;
  const inviterName = route.params?.inviterName || '';
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChangePhone = (value) => {
    const hasInvalidCharacter = /[^0-9+\s]/.test(value);
    let next = value.replace(/[^\d+]/g, '');
    if (next.includes('+')) next = `+${next.replace(/\+/g, '')}`;
    if (next.length > 20) next = next.slice(0, 20);
    if (hasInvalidCharacter) setError('Use numbers only.');
    else setError('');
    setContactName(null);
    setPhone(next);
  };

  const chooseContact = async () => {
    setError('');
    try {
      const picked = await pickContact();
      if (!picked) return;
      if (picked.unavailable) {
        setError('Choosing a contact is available on your phone.');
        return;
      }
      if (picked.denied) {
        setError('Contacts access is off. You can still type the number.');
        return;
      }
      if (picked.error) {
        setError(picked.error);
        return;
      }
      setPhone(picked.phone);
      setContactName(picked.name);
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      if (fromLink) {
        await sendCircleInvite(sessionId, user.id, route.params.inviterId, null, 'link');
      } else {
        const trimmed = normalizePhone(phone);
        const digitCount = trimmed.replace(/\D/g, '').length;
        if (!trimmed || digitCount < 10) {
          setError('Enter a full phone number.');
          setLoading(false);
          return;
        }
        const found = await findUserByPhone(sessionId, user.id, trimmed);
        await sendCircleInvite(sessionId, user.id, found.id, contactName, 'app');
      }
      showToast('Invite sent');
      await queryClient.invalidateQueries({ queryKey: ['circle', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['circle-cards', user.id] });
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title="Add to circle" onBack={() => navigation.goBack()} />
      <View style={styles.scroll}>
        {fromLink ? (
          <Text style={styles.subtitle}>
            {firstNameOf(inviterName)} invited you. Send a request to join their circle. They will see it on Pending.
          </Text>
        ) : (
          <>
            <Text style={styles.subtitle}>Find them by the phone number they use on CardShare. A contact name is shown only to you.</Text>
            <View style={styles.choose}>
              <SecondaryButton label="Choose from contacts" onPress={chooseContact} disabled={loading} />
            </View>
            {contactName ? <Text style={styles.picked}>Saved as {contactName}</Text> : null}
            <TextField
              value={phone}
              onChangeText={onChangePhone}
              placeholder="+92 3xx xxxxxxx"
              keyboardType="phone-pad"
              style={styles.input}
              maxLength={20}
            />
          </>
        )}
        <ErrorBanner message={error} />
        <PrimaryButton label="Send invite" loading={loading} onPress={submit} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  choose: {
    marginBottom: theme.spacing.lg,
  },
  picked: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  input: {
    marginBottom: theme.spacing.lg,
  },
});
