import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import TextField from '../components/TextField';
import { sendOtp } from '../api/auth';
import { useTopInset } from '../hooks/useTopInset';
import { normalizePhone } from '../utils/phone';
import theme from '../constants/theme';

export default function PhoneScreen({ onBack, onSent }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const topInset = useTopInset();

  const onChangePhone = (value) => {
    const hasInvalidCharacter = /[^0-9+\s]/.test(value);
    let next = value.replace(/[^\d+]/g, '');
    if (next.includes('+')) {
      next = `+${next.replace(/\+/g, '')}`;
    }
    if (next.length > 20) {
      next = next.slice(0, 20);
      setError('Phone number is too long.');
    } else if (hasInvalidCharacter) {
      setError('Use numbers only.');
    } else {
      setError('');
    }
    setPhone(next);
  };

  const submit = async () => {
    const trimmed = normalizePhone(phone);
    const digitCount = trimmed.replace(/\D/g, '').length;
    if (!trimmed) {
      setError('Phone number is required.');
      return;
    }
    if (digitCount < 10) {
      setError('Enter a full phone number.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await sendOtp(trimmed);
      onSent(trimmed);
    } catch (err) {
      setError(err.message);
      if (err.status === 429 && err.payload?.code === 'OTP_COOLDOWN') {
        setError('Please wait a moment before requesting another code.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Enter your{'\n'}phone number</Text>
      <Text style={styles.subtitle}>
        We'll send a 6-digit code. A new number and an existing account use this same step.
      </Text>
      <TextField
        value={phone}
        onChangeText={onChangePhone}
        placeholder="+92 3xx xxxxxxx"
        keyboardType="phone-pad"
        autoComplete="tel"
        style={styles.input}
        maxLength={20}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Continue" loading={sending} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xxl,
    paddingVertical: theme.spacing.xs,
  },
  backText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    lineHeight: theme.lineHeight.hero,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text2,
    marginBottom: theme.spacing.xxl,
  },
  input: {
    marginBottom: theme.spacing.lg,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
    marginBottom: theme.spacing.lg,
  },
});
