import { Pressable, StyleSheet, View } from 'react-native';
import theme from '../constants/theme';

const WINDOW = 5;

// Small dots under a card pager. Past six cards only five show, and the ones
// at the edge of the window shrink to hint that there are more.
export default function CardDots({ count, index, onPick, label = 'Card' }) {
  if (count < 2) return null;
  let start = 0;
  let end = count;
  if (count > WINDOW + 1) {
    start = Math.max(0, Math.min(count - WINDOW, index - 2));
    end = start + WINDOW;
  }
  const dots = [];
  for (let i = start; i < end; i += 1) {
    const edge = (i === start && start > 0) || (i === end - 1 && end < count);
    const on = i === index;
    dots.push(
      <Pressable
        key={i}
        onPress={() => onPick?.(i)}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${i + 1}`}
        accessibilityState={{ selected: on }}
      >
        <View style={[styles.dot, on && styles.dotOn, edge && !on && styles.dotSmall]} />
      </Pressable>
    );
  }
  return <View style={styles.row}>{dots}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(10, 13, 15, 0.18)',
  },
  dotOn: {
    width: 18,
    borderRadius: 6,
    backgroundColor: theme.colors.green,
  },
  dotSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
