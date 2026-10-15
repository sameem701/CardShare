import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatPkr } from '../utils/format';

export default function HomeStats({ stats }) {
  if (!stats) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Total received</Text>
        <Text style={styles.total}>{formatPkr(stats.earnedAll)}</Text>
        <Text style={styles.count}>{stats.paidCountMonth} paid orders this month</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Text style={[styles.figure, styles.green]}>{formatPkr(stats.savedMonth)}</Text>
          <Text style={styles.caption}>Others saved</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.figure}>{formatPkr(stats.earnedMonth)}</Text>
          <Text style={styles.caption}>Received this month</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[styles.figure, styles.circleFigure]}>{stats.circleCount}</Text>
          <Text style={styles.caption}>In circle</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.layout.screenPadding,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  hero: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  total: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.display,
    lineHeight: theme.lineHeight.display,
    color: theme.colors.text,
  },
  count: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  figure: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    color: theme.colors.text,
  },
  green: {
    color: theme.colors.green,
  },
  circleFigure: {
    fontSize: theme.fontSize.hero,
    lineHeight: theme.lineHeight.hero,
  },
  caption: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
});
