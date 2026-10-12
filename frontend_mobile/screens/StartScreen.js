import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import theme from '../constants/theme';

export default function StartScreen({ onContinue }) {
  return (
    <View style={styles.onboard}>
      <View style={styles.mark}>
        <Svg width={36} height={36} viewBox="0 0 36 36" fill="none">
          <Rect x="4" y="12" width="28" height="20" rx="4" stroke="black" strokeWidth="2.5" />
          <Path d="M12 12V10a6 6 0 0 1 12 0v2" stroke="black" strokeWidth="2.5" strokeLinecap="round" />
          <Circle cx="18" cy="22" r="3" fill="black" />
          <Path d="M18 25v3" stroke="black" strokeWidth="2" strokeLinecap="round" />
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
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onContinue}
        >
          <Text style={styles.buttonText}>Get started</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed]}
          onPress={onContinue}
        >
          <Text style={styles.ghostText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  onboard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: theme.colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 38,
    textAlign: 'center',
    color: theme.colors.text,
    marginBottom: 14,
  },
  titleAccent: {
    color: theme.colors.green,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    lineHeight: 26,
    textAlign: 'center',
    color: theme.colors.text2,
    maxWidth: 300,
    marginBottom: 36,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  button: {
    width: '100%',
    backgroundColor: theme.colors.green,
    borderRadius: theme.radius.control,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: theme.colors.greenDark,
    transform: [{ scale: 0.97 }],
  },
  buttonText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.black,
  },
  ghost: {
    width: '100%',
    backgroundColor: theme.colors.bg3,
    borderRadius: theme.radius.control,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ghostPressed: {
    backgroundColor: theme.colors.bg4,
  },
  ghostText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
});
