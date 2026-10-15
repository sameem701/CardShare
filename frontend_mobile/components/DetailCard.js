import { Children } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

export function DetailCard({ children }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.card}>
      {items.map((child, index) => (
        <View key={index} style={index < items.length - 1 ? styles.divider : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function DetailRow({ label, value, highlight }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, highlight && styles.highlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.bg2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  label: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  value: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
    textAlign: 'right',
  },
  highlight: {
    color: theme.colors.green,
  },
});
