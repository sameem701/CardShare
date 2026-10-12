import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendOtp } from '../api/auth';
import theme from '../constants/theme';

export default function PhoneScreen({ onBack, onSent }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

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
    const trimmed = phone.trim();
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
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Enter your{'\n'}phone number</Text>
      <Text style={styles.subtitle}>
        We'll send a 6-digit code. A new number and an existing account use this same step.
      </Text>
      <TextInput
        value={phone}
        onChangeText={onChangePhone}
        placeholder="+92 3xx xxxxxxx"
        placeholderTextColor={theme.colors.text3}
        keyboardType="phone-pad"
        autoComplete="tel"
        style={styles.input}
        maxLength={20}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, sending && styles.disabled]}
        onPress={submit}
        disabled={sending}
      >
        <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Continue'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: 24,
    paddingVertical: 6,
  },
  backText: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.text2,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    lineHeight: 32,
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.text2,
    marginBottom: 28,
  },
  input: {
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    color: theme.colors.text,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.red,
    marginBottom: 16,
  },
  button: {
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.control,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: theme.colors.greenDark,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.black,
  },
});
