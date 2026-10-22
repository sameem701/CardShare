import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import theme from '../constants/theme';

const DOT = 7;
const GAP = theme.spacing.sm;
const PILL = 18;
const STEP = DOT + GAP;

export default function PageDots({ count, scrollX, pageWidth, labels, onSelect }) {
  const travel = Math.max(count - 1, 0) * STEP;
  const translateX = useMemo(() => {
    const distance = pageWidth > 0 ? pageWidth * Math.max(count - 1, 1) : 1;
    return scrollX.interpolate({
      inputRange: [0, distance],
      outputRange: [0, pageWidth > 0 ? travel : 0],
      extrapolate: 'clamp',
    });
  }, [scrollX, pageWidth, count, travel]);

  return (
    <View style={styles.row}>
      <View style={[styles.track, { width: count * DOT + Math.max(count - 1, 0) * GAP }]}>
        <View style={styles.dots}>
          {Array.from({ length: count }, (_, index) => (
            <Pressable
              key={labels?.[index] || index}
              onPress={() => onSelect?.(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={labels?.[index] || `Page ${index + 1}`}
            >
              <View style={styles.dot} />
            </Pressable>
          ))}
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { transform: [{ translateX }] }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
  },
  track: {
    height: DOT,
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: GAP,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pill: {
    position: 'absolute',
    left: -((PILL - DOT) / 2),
    top: 0,
    width: PILL,
    height: DOT,
    borderRadius: DOT,
    backgroundColor: theme.colors.green,
  },
});
