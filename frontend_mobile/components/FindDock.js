import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import theme from '../constants/theme';

function Check({ on }) {
  return (
    <View style={[styles.box, on && styles.boxOn]}>
      {on ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke={theme.colors.ink}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

export default function FindDock({ allOn, ready, onToggleAll, onRequest }) {
  return (
    <LinearGradient
      colors={['rgba(30,31,33,0)', theme.colors.bg]}
      locations={[0, 0.38]}
      style={styles.dock}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [styles.select, allOn && styles.selectOn, pressed && { transform: [{ scale: theme.motion.press }] }]}
        onPress={onToggleAll}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allOn }}
        accessibilityLabel="Select all"
      >
        <Check on={allOn} />
        <Text style={styles.selectText}>Select all</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.request,
          ready && styles.requestReady,
          pressed && ready && { transform: [{ scale: theme.motion.press }] },
        ]}
        onPress={onRequest}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel="Request"
        accessibilityState={{ disabled: !ready }}
      >
        <Text style={[styles.requestText, ready && styles.requestTextReady]}>Request</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.bg2,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    borderRadius: 14,
  },
  selectOn: {
    borderColor: theme.colors.green,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: theme.colors.green,
    borderColor: theme.colors.green,
  },
  selectText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  request: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg4,
  },
  requestReady: {
    backgroundColor: theme.colors.green,
  },
  requestText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.text3,
  },
  requestTextReady: {
    color: theme.colors.ink,
  },
});
