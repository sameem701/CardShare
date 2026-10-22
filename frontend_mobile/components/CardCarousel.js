import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatPkr, sharingOn } from '../utils/format';
import VirtualCard from './VirtualCard';

const TRACK_WIDTH = 48;
const THUMB_SIZE = 22;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4;

function SharingSwitch({ on }) {
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.spring(progress, {
      toValue: on ? 1 : 0,
      stiffness: 320,
      damping: 26,
      mass: 0.7,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [on, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMB_TRAVEL],
  });
  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.bg4, theme.colors.green],
  });

  return (
    <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
    </Animated.View>
  );
}

function CardPage({ card, displayName, earnedByCard, onToggleSharing, onRemove }) {
  const sharing = sharingOn(card.allow_sharing);
  return (
    <View style={styles.cardShell}>
      <VirtualCard
        bankName={card.bank_name}
        cardTier={card.card_tier}
        displayName={displayName}
        earnedText={`${formatPkr(earnedByCard[card.id] || 0)} earned`}
      />
      <View style={styles.foot}>
        <View style={styles.shareBlock}>
          <Pressable
            style={styles.shareRow}
            onPress={() => onToggleSharing?.(card)}
            accessibilityRole="switch"
            accessibilityState={{ checked: sharing }}
            accessibilityLabel={sharing ? 'Sharing on' : 'Sharing off'}
          >
            <Text style={styles.footText}>Sharing</Text>
            <SharingSwitch on={sharing} />
          </Pressable>
          <Text style={styles.shareHint}>
            {sharing
              ? 'Your circle can see this card and ask you to order on it.'
              : 'Your circle cannot see this card.'}
          </Text>
        </View>
        <Pressable
          style={styles.removeButton}
          onPress={() => onRemove?.(card)}
          accessibilityRole="button"
          accessibilityLabel="Remove card"
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function CardCarousel({ cards, displayName, earnedByCard = {}, onToggleSharing, onRemove }) {
  const scroller = useRef(null);
  const indexRef = useRef(0);
  const widthRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const count = cards.length;
  const hasMultiple = count > 1;

  useEffect(() => {
    if (width <= 0) return;
    const max = Math.max(0, count - 1);
    const page = Math.min(indexRef.current, max);
    const widthChanged = widthRef.current !== width;
    widthRef.current = width;
    if (!widthChanged && page === indexRef.current) return;
    indexRef.current = page;
    setIndex(page);
    scroller.current?.scrollTo({ x: page * width, animated: false });
  }, [count, width]);

  const remember = (x) => {
    if (width <= 0) return;
    const next = Math.max(0, Math.min(count - 1, Math.round(x / width)));
    indexRef.current = next;
    setIndex((prev) => (prev === next ? prev : next));
  };

  const go = (delta) => {
    if (width <= 0) return;
    const next = Math.max(0, Math.min(count - 1, indexRef.current + delta));
    scroller.current?.scrollTo({ x: next * width, animated: true });
  };

  if (count === 0) return null;

  return (
    <View style={styles.wrap}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="start"
            disableIntervalMomentum
            scrollEventThrottle={16}
            scrollEnabled={hasMultiple}
            directionalLockEnabled
            onScroll={(event) => remember(event.nativeEvent.contentOffset.x)}
            style={{ width }}
          >
            {cards.map((card) => (
              <View key={card.id} style={{ width }}>
                <CardPage
                  card={card}
                  displayName={displayName}
                  earnedByCard={earnedByCard}
                  onToggleSharing={onToggleSharing}
                  onRemove={onRemove}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {hasMultiple ? (
        <View style={styles.controls}>
          <Pressable
            style={({ pressed }) => [
              styles.arrow,
              pressed && index > 0 && styles.arrowPressed,
              index === 0 && styles.arrowDisabled,
            ]}
            onPress={() => go(-1)}
            disabled={index === 0}
            accessibilityLabel="Previous card"
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} / {count}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.arrow,
              pressed && index < count - 1 && styles.arrowPressed,
              index >= count - 1 && styles.arrowDisabled,
            ]}
            onPress={() => go(1)}
            disabled={index >= count - 1}
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  shareBlock: {
    flex: 1,
    gap: 6,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
  },
  shareHint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 18,
    color: theme.colors.text2,
  },
  footText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  track: {
    width: TRACK_WIDTH,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
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
  arrowDisabled: {
    opacity: 0.35,
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
