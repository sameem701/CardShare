import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import SheetOverlay from './SheetOverlay';
import TextField from './TextField';
import { useEffect, useState } from 'react';

export default function ReasonModal({ visible, title, onCancel, onSubmit, loading, error }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) setReason('');
  }, [visible]);

  return (
    <SheetOverlay visible={visible} onClose={loading ? undefined : onCancel}>
      <Text style={styles.title}>{title}</Text>
      <TextField
        value={reason}
        onChangeText={setReason}
        placeholder="Reason"
        accessibilityLabel="Reason"
        multiline
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Confirm" loading={loading} onPress={() => onSubmit(reason.trim())} />
      <View style={styles.gap} />
      <SecondaryButton label="Cancel" onPress={onCancel} disabled={loading} />
    </SheetOverlay>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  input: {
    marginBottom: theme.spacing.md,
  },
  error: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
    marginBottom: theme.spacing.md,
  },
  gap: {
    height: theme.spacing.sm,
  },
});
