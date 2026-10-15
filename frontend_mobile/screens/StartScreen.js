import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import theme from '../constants/theme';

export default function StartScreen({ onContinue }) {
  return (
    <View style={styles.onboard}>
      <View style={styles.mark}>
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Rect x="4" y="12" width="28" height="20" rx="4" stroke={theme.colors.black} strokeWidth="2.5" />
          <Path d="M12 12V10a6 6 0 0 1 12 0v2" stroke={theme.colors.black} strokeWidth="2.5" strokeLinecap="round" />
          <Circle cx="18" cy="22" r="3" fill={theme.colors.black} />
          <Path d="M18 25v3" stroke={theme.colors.black} strokeWidth="2" strokeLinecap="round" />
        </Svg>
      </View>
      <Text style={styles.title}>
        Lend your{'\n'}discounts.{'\n'}
        <Text style={styles.titleAccent}>Earn passively.</Text>
      </Text>
      <Text style={styles.body}>
        Share your card discounts with people you trust. Get paid for having a discount.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label="Get started" onPress={onContinue} />
        <SecondaryButton label="I already have an account" onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  onboard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.screenPadding,
    paddingVertical: theme.spacing.xxl,
  },
  mark: {
    width: theme.layout.brandMark,
    height: theme.layout.brandMark,
    borderRadius: theme.radius.mark,
    backgroundColor: theme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.display,
    letterSpacing: -1,
    lineHeight: theme.lineHeight.display,
    textAlign: 'center',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  titleAccent: {
    color: theme.colors.green,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    lineHeight: theme.lineHeight.body,
    textAlign: 'center',
    color: theme.colors.text2,
    maxWidth: theme.layout.copyMaxWidth,
    marginBottom: theme.spacing.xxl,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.section,
  },
});
