import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTopInset } from '../../hooks/useTopInset';
import theme from '../../constants/theme';

function PeopleIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8" r="3" stroke={theme.colors.green} strokeWidth="1.8" />
      <Circle cx="17" cy="9" r="2.4" stroke={theme.colors.green} strokeWidth="1.8" />
      <Path
        d="M3.5 19c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5M15 15c2.8-.2 4.5 1.1 5 3.5"
        stroke={theme.colors.green}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CardIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="14" rx="3" stroke={theme.colors.green} strokeWidth="1.8" />
      <Path d="M3 10h18" stroke={theme.colors.green} strokeWidth="1.8" />
    </Svg>
  );
}

export default function ChoiceScreen({ onSave, onShare, onSkip }) {
  const topInset = useTopInset();

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <Text style={styles.title}>Where do you want to start?</Text>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={onSave}
        accessibilityRole="button"
        accessibilityLabel="I want to save"
      >
        <View style={styles.icon}><PeopleIcon /></View>
        <View style={styles.body}>
          <Text style={styles.name}>I want to save</Text>
          <Text style={styles.muted}>Ask people you trust to place your order with their card.</Text>
        </View>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="I want to share"
      >
        <View style={styles.icon}><CardIcon /></View>
        <View style={styles.body}>
          <Text style={styles.name}>I want to share</Text>
          <Text style={styles.muted}>Share your card and earn when you order for someone.</Text>
        </View>
      </Pressable>
      <Pressable onPress={onSkip} accessibilityRole="button" style={styles.skip}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 24,
    paddingBottom: 28,
    justifyContent: 'center',
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    lineHeight: 32,
    color: theme.colors.text,
    marginBottom: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  pressed: {
    transform: [{ scale: theme.motion.press }],
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingTop: 2,
  },
  name: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.text,
  },
  muted: {
    marginTop: 4,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 19,
    color: theme.colors.text2,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  skipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
});
