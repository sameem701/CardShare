import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

const VARIANTS = {
  green: { color: theme.colors.green, bg: theme.colors.greenDim },
  amber: { color: theme.colors.amber, bg: theme.colors.amberDim },
  blue: { color: theme.colors.blue, bg: theme.colors.blueDim },
  red: { color: theme.colors.red, bg: theme.colors.redDim },
  gray: { color: theme.colors.text2, bg: theme.colors.bg4 },
};

export default function Badge({ label, variant = 'gray' }) {
  const tone = VARIANTS[variant] || VARIANTS.gray;
  return (
    <View style={[styles.wrap, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  text: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
  },
});
