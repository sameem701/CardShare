import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { sendOtp, verifyOtp } from '../api/auth';
import theme from '../constants/theme';

export default function VerifyScreen({ phone, onBack, onVerified }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(45);
  const [focused, setFocused] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const onChangeCode = (value) => {
    const hasInvalidCharacter = /\D/.test(value);
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length > 6) {
      setError('The code is 6 digits.');
    } else if (hasInvalidCharacter) {
      setError('Use numbers only.');
    } else {
      setError('');
    }
    setCode(digitsOnly.slice(0, 6));
  };

  const verify = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }

    setWorking(true);
    setError('');
    try {
      const result = await verifyOtp(phone, code);
      onVerified(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const resend = async () => {
    setWorking(true);
    setError('');
    try {
      await sendOtp(phone);
      setSecondsLeft(45);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const digits = Array.from({ length: 6 }, (_, index) => code[index] || '');
  const activeIndex = code.length < 6 ? code.length : 5;
  const resendLabel = `Resend in 00:${String(secondsLeft).padStart(2, '0')}`;

  return (
    <View style={styles.screen}>
      <Pressable onPress={onBack} style={styles.back} disabled={working}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Verify your{'\n'}phone number</Text>
      <Text style={styles.subtitle}>We sent a 6-digit code to {phone}</Text>
      <Pressable style={styles.otpWrap} onPress={() => inputRef.current?.focus()}>
        {digits.map((digit, index) => {
          const isActive = focused && index === activeIndex;
          return (
            <View
              key={index}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null, isActive && styles.otpBoxActive]}
            >
              {digit ? <Text style={styles.otpDigit}>{digit}</Text> : isActive ? <View style={styles.mark} /> : <Text style={styles.otpDigit}>•</Text>}
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={onChangeCode}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          caretHidden
          style={styles.hiddenInput}
        />
      </Pressable>
      {secondsLeft > 0 ? (
        <Text style={styles.resendText}>{resendLabel}</Text>
      ) : (
        <Pressable onPress={resend} disabled={working}>
          <Text style={styles.resendText}>Resend code</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, working && styles.disabled]}
        onPress={verify}
        disabled={working}
      >
        <Text style={styles.buttonText}>{working ? 'Please wait…' : 'Verify & continue'}</Text>
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
  otpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 20,
  },
  otpBox: {
    width: 52,
    height: 60,
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    borderColor: theme.colors.green,
  },
  otpBoxActive: {
    borderColor: theme.colors.green,
    borderWidth: 1.5,
  },
  mark: {
    width: 2,
    height: 22,
    backgroundColor: theme.colors.text,
  },
  otpDigit: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    color: theme.colors.text,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: '100%',
    height: 60,
  },
  resendText: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.text3,
    textAlign: 'center',
    marginBottom: 28,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.red,
    textAlign: 'center',
    marginTop: -16,
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
