import { Children } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { isProductUrl } from '../utils/productUrl';

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

export function DetailRow({ label, value, highlight, link }) {
  const raw = String(value || '').trim();
  const canOpen = Boolean(link) && isProductUrl(raw);
  const openLink = () => {
    if (!canOpen) return;
    Linking.openURL(raw).catch(() => {});
  };
  const valueStyle = [
    styles.value,
    highlight && styles.highlight,
    canOpen && styles.link,
  ];
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {canOpen ? (
        <Text
          style={valueStyle}
          onPress={openLink}
          accessibilityRole="link"
          accessibilityLabel={String(value)}
        >
          {String(value).replace(/(.{28})/g, '$1\u200b')}
        </Text>
      ) : (
        <Text style={valueStyle}>{value}</Text>
      )}
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
    flexShrink: 1,
    minWidth: 0,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
    textAlign: 'right',
  },
  highlight: {
    color: theme.colors.green,
  },
  link: {
    color: theme.colors.blue,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' ? { wordBreak: 'break-all' } : {}),
  },
});
