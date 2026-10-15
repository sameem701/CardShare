import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextField from '../components/TextField';
import { sendCircleInvite } from '../api/circle';
import { findUserByPhone } from '../api/profile';
import ErrorBanner from '../components/ErrorBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { normalizePhone } from '../utils/phone';

export default function AddCircleScreen({ onBack }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onChangePhone = (value) => {
    const hasInvalidCharacter = /[^0-9+\s]/.test(value);
    let next = value.replace(/[^\d+]/g, '');
    if (next.includes('+')) next = `+${next.replace(/\+/g, '')}`;
    if (next.length > 20) next = next.slice(0, 20);
    if (hasInvalidCharacter) setError('Use numbers only.');
    else setError('');
    setPhone(next);
  };

  const submit = async () => {
    const trimmed = normalizePhone(phone);
    const digitCount = trimmed.replace(/\D/g, '').length;
    if (!trimmed || digitCount < 10) {
      setError('Enter a full phone number.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const found = await findUserByPhone(sessionId, user.id, trimmed);
      await sendCircleInvite(sessionId, user.id, found.id);
      showToast('Invite sent');
      onBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title="Add to circle" onBack={onBack} />
      <View style={styles.scroll}>
        <Text style={styles.subtitle}>Find them by the phone number they use on CardCircle.</Text>
        <TextField
          value={phone}
          onChangeText={onChangePhone}
          placeholder="+92 3xx xxxxxxx"
          keyboardType="phone-pad"
          style={styles.input}
          maxLength={20}
        />
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
  input: {
    marginBottom: theme.spacing.lg,
  },
});
