import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import theme from '../constants/theme';
import { cardholderNameLine } from '../utils/initials';

export default function VirtualCard({
  bankName,
  cardTier,
  displayName,
  earnedText,
}) {
  return (
    <LinearGradient
      colors={[theme.colors.vcardFace, theme.colors.vcardFaceEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.vcard}
    >
      <View style={styles.glow} />
      <View style={styles.chip}>
        <Svg width={16} height={12} viewBox="0 0 16 12" fill="none">
          <Rect x="0.5" y="0.5" width="15" height="11" rx="2" stroke={theme.colors.vcardChipStroke} />
          <Path d="M0 4H16M0 8H16M5 0V12M11 0V12" stroke={theme.colors.vcardChipLine} />
        </Svg>
      </View>
      <Text style={styles.number}>••••  ••••  ••••  ••••</Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>{bankName}</Text>
        <Text style={styles.metaText}>{cardTier}</Text>
      </View>
      <Text style={styles.name}>{cardholderNameLine(displayName)}</Text>
      {earnedText ? <Text style={styles.earned}>{earnedText}</Text> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  vcard: {
    borderRadius: theme.radius.vcard,
    padding: theme.spacing.xxl,
    borderWidth: 0.5,
    borderColor: theme.colors.vcardBorder,
    overflow: 'hidden',
    minHeight: 150,
  },
  glow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: theme.colors.vcardGlow,
  },
  chip: {
    width: 32,
    height: 24,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.vcardChipBg,
    borderWidth: 0.5,
    borderColor: theme.colors.vcardChipBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  number: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.input,
    letterSpacing: 2,
    color: theme.colors.text,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  metaText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.text2,
  },
  name: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  earned: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.green,
    marginTop: theme.spacing.xs,
  },
});
