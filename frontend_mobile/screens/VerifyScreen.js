import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackIcon } from '../components/TopBar';
import PrimaryButton from '../components/PrimaryButton';
import { sendOtp, verifyOtp } from '../api/auth';
import { useTopInset } from '../hooks/useTopInset';
import theme from '../constants/theme';

const RESEND_SECONDS = 60;

export default function VerifyScreen({ phone, onBack, onVerified }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resendsUsed, setResendsUsed] = useState(0);
  const topInset = useTopInset();
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
      if (err.status === 429 && err.payload?.retry_after_ms) {
        setSecondsLeft(Math.ceil(err.payload.retry_after_ms / 1000));
      }
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0 || resendsUsed >= 1) return;
    setWorking(true);
    setError('');
    try {
      await sendOtp(phone);
      setResendsUsed(1);
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      if (err.status === 429 && err.payload?.retry_after_ms) {
        setSecondsLeft(Math.ceil(err.payload.retry_after_ms / 1000));
      }
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const digits = Array.from({ length: 6 }, (_, index) => code[index] || '');
  const activeIndex = code.length < 6 ? code.length : 5;
  const resendLabel = `Resend in 00:${String(secondsLeft).padStart(2, '0')}`;

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <Pressable onPress={onBack} style={styles.back} disabled={working} accessibilityRole="button" accessibilityLabel="Back">
        <BackIcon />
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
      {resendsUsed >= 1 ? (
        <Text style={styles.resendText}>A new code can be sent once.</Text>
      ) : secondsLeft > 0 ? (
        <Text style={styles.resendText}>{resendLabel}</Text>
      ) : (
        <Pressable onPress={resend} disabled={working} accessibilityRole="button" accessibilityLabel="Resend code">
          <Text style={styles.resendText}>Resend code</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Verify & continue" loading={working} onPress={verify} />
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
  otpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.section,
    marginVertical: theme.spacing.xl,
  },
  otpBox: {
    width: theme.layout.otpBoxWidth,
    height: theme.layout.otpBoxHeight,
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
    width: theme.layout.caretWidth,
    height: theme.layout.caretHeight,
    backgroundColor: theme.colors.text,
  },
  otpDigit: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.otp,
    color: theme.colors.text,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: '100%',
    height: theme.layout.otpBoxHeight,
  },
  resendText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
    textAlign: 'center',
    marginBottom: theme.spacing.xxl,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
    textAlign: 'center',
    marginTop: -theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
});
