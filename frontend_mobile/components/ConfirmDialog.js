import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import PrimaryButton from './PrimaryButton';
import SecondaryButton from './SecondaryButton';
import SheetOverlay from './SheetOverlay';

export default function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
  onCancel,
  onConfirm,
}) {
  return (
    <SheetOverlay visible={visible} onClose={loading ? undefined : onCancel}>
      <Text style={[styles.title, !body && styles.titleAlone]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {danger ? (
        <SecondaryButton label={confirmLabel} danger disabled={loading} onPress={onConfirm} />
      ) : (
        <PrimaryButton label={confirmLabel} loading={loading} onPress={onConfirm} />
      )}
      <View style={styles.gap} />
      <SecondaryButton label="Cancel" onPress={onCancel} disabled={loading} />
    </SheetOverlay>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    lineHeight: 36,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  titleAlone: {
    marginBottom: theme.spacing.xxl,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
  },
  gap: {
    height: theme.spacing.sm,
  },
});
