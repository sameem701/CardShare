import { Pressable, StyleSheet, Text } from 'react-native';
import theme from '../constants/theme';

export default function HomeNotice({ text, action, onPress }) {
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${text}. ${action}`}
    >
      <Text style={styles.text}>{text}</Text>
      <Text style={styles.action}>{action}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  text: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 20,
    color: theme.colors.text,
  },
  action: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
});
