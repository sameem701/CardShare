import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatPkr, sharingOn } from '../utils/format';
import VirtualCard from './VirtualCard';

const TRACK_WIDTH = 36;
const THUMB_SIZE = 16;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4;

function SharingSwitch({ on }) {
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: on ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [on, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMB_TRAVEL],
  });
  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.08)', 'rgba(0, 200, 122, 0.28)'],
  });
  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.16)', 'rgba(0, 200, 122, 1)'],
  });
  const thumbColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(138, 144, 153, 1)', 'rgba(0, 200, 122, 1)'],
  });

  return (
    <Animated.View style={[styles.track, { backgroundColor: trackColor, borderColor }]}>
      <Animated.View style={[styles.thumb, { backgroundColor: thumbColor, transform: [{ translateX }] }]} />
    </Animated.View>
  );
}

export default function CardCarousel({ cards, displayName, earnedByCard = {}, onToggleSharing, onRemove }) {
  const [index, setIndex] = useState(0);
  const count = cards.length;
  const hasMultiple = count > 1;
  const current = cards[index];

  useEffect(() => {
    setIndex((prev) => Math.min(prev, Math.max(0, count - 1)));
  }, [count]);

  const goPrev = () => setIndex((prev) => (prev <= 0 ? count - 1 : prev - 1));
  const goNext = () => setIndex((prev) => (prev >= count - 1 ? 0 : prev + 1));

  if (!current) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.cardShell}>
        <VirtualCard
          bankName={current.bank_name}
          cardTier={current.card_tier}
          displayName={displayName}
          earnedText={`${formatPkr(earnedByCard[current.id] || 0)} earned`}
        />
        <View style={styles.foot}>
          <Pressable
            style={styles.shareRow}
            onPress={() => onToggleSharing?.(current)}
            accessibilityRole="switch"
            accessibilityState={{ checked: sharingOn(current.allow_sharing) }}
            accessibilityLabel={sharingOn(current.allow_sharing) ? 'Sharing on' : 'Sharing off'}
          >
            <Text style={styles.footText}>Sharing</Text>
            <SharingSwitch on={sharingOn(current.allow_sharing)} />
          </Pressable>
          <Pressable
            style={styles.removeButton}
            onPress={() => onRemove?.(current)}
            accessibilityRole="button"
            accessibilityLabel="Remove card"
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      </View>

      {hasMultiple ? (
        <View style={styles.controls}>
          <Pressable
            style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
            onPress={goPrev}
            accessibilityLabel="Previous card"
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} / {count}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
            onPress={goNext}
            accessibilityLabel="Next card"
          >
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  cardShell: {
    backgroundColor: theme.colors.bg2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  footText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  track: {
    width: TRACK_WIDTH,
    height: 20,
    borderRadius: 10,
    padding: 2,
    borderWidth: 0.5,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  removeButton: {
    borderWidth: 0.5,
    borderColor: theme.colors.red,
    backgroundColor: theme.colors.redDim,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  removeText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  arrow: {
    width: theme.layout.carouselArrow,
    height: theme.layout.carouselArrow,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPressed: {
    backgroundColor: theme.colors.bg4,
  },
  arrowText: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.carouselArrow,
    color: theme.colors.text,
    lineHeight: theme.fontSize.carouselArrow,
    marginTop: -2,
  },
  counter: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    minWidth: theme.layout.carouselCounterMinWidth,
    textAlign: 'center',
  },
});
