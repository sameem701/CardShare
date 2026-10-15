import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import TextField from '../components/TextField';
import { updateProfile } from '../api/onboarding';
import { useTopInset } from '../hooks/useTopInset';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { buildDisplayName } from '../utils/initials';

const MAX_FIRST = 50;
const MAX_LAST = 49;

export default function NameScreen({ onBack, onSaved }) {
  const { sessionId, user, updateUser } = useSession();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const topInset = useTopInset();

  const onChangeFirst = (value) => {
    if (value.length > MAX_FIRST) {
      setError(`First name must be ${MAX_FIRST} characters or less.`);
      setFirstName(value.slice(0, MAX_FIRST));
      return;
    }
    setError('');
    setFirstName(value);
  };

  const onChangeLast = (value) => {
    if (value.length > MAX_LAST) {
      setError(`Last name must be ${MAX_LAST} characters or less.`);
      setLastName(value.slice(0, MAX_LAST));
      return;
    }
    setError('');
    setLastName(value);
  };

  const submit = async () => {
    const displayName = buildDisplayName(firstName, lastName);
    if (!displayName) {
      setError('Enter both first and last name.');
      return;
    }
    if (displayName.length > 100) {
      setError('Combined name must be 100 characters or less.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateProfile(sessionId, user.id, displayName);
      await updateUser({ display_name: displayName });
      onSaved?.(displayName);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <Pressable onPress={onBack} style={styles.back} disabled={saving} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>What should{'\n'}we call you?</Text>
      <Text style={styles.subtitle}>
        First and last name — this is what people in your circle see on your cards.
      </Text>
      <Text style={styles.label}>First name</Text>
      <TextField
        value={firstName}
        onChangeText={onChangeFirst}
        placeholder="Ahmed"
        autoComplete="given-name"
        style={styles.input}
        maxLength={MAX_FIRST}
      />
      <Text style={styles.label}>Last name</Text>
      <TextField
        value={lastName}
        onChangeText={onChangeLast}
        placeholder="Khan"
        autoComplete="family-name"
        style={styles.input}
        maxLength={MAX_LAST}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, saving && styles.disabled]}
        onPress={submit}
        disabled={saving}
      >
        <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Continue'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: theme.spacing.xxl,
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
    lineHeight: 32,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    marginBottom: theme.spacing.xxl,
    lineHeight: 22,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
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
  button: {
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.control,
    paddingVertical: theme.spacing.lg,
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
    fontSize: theme.fontSize.input,
    color: theme.colors.black,
  },
});
