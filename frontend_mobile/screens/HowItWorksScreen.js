import { Pressable, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import { BackIcon } from '../components/TopBar';
import { useTopInset } from '../hooks/useTopInset';
import theme from '../constants/theme';

const STEPS = [
  'Ask people in your circle who have the card with the discount.',
  'They place your order with their own card. Cards are never shared.',
  'You pay them back, plus a share of what you saved. You save, they earn.',
];

export default function HowItWorksScreen({ onBack, onContinue, finishLabel = 'Continue' }) {
  const topInset = useTopInset();

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <View style={styles.top}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackIcon />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.kicker}>How CardShare works</Text>
        <Text style={styles.title}>Save with a friend’s card.{'\n'}Earn with yours.</Text>
        <View style={styles.steps}>
          {STEPS.map((line, index) => (
            <View key={line} style={styles.step}>
              <View style={styles.num}>
                <Text style={styles.numText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{line}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={finishLabel} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  top: {
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  back: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: {
    transform: [{ scale: theme.motion.pressIcon }],
    opacity: 0.72,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.text3,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: theme.colors.text,
    marginTop: 6,
    marginBottom: 10,
  },
  steps: {
    marginTop: 16,
    gap: 10,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 12,
    color: theme.colors.green,
  },
  stepText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  actions: {
    marginTop: 24,
  },
});
