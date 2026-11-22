import { useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import PageDots from './PageDots';
import theme from '../constants/theme';

function whole(value) {
  return Number(value || 0).toLocaleString('en-PK');
}

function Pane({ width, kicker, total, thisMonth, lastMonth }) {
  return (
    <View style={[styles.page, { width }]}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.currency} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          PKR <Text style={styles.amount}>{whole(total)}</Text>
        </Text>
      </View>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Text style={styles.tileCurrency}>PKR</Text>
          <Text style={styles.figure} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{whole(thisMonth)}</Text>
          <Text style={styles.caption}>This month</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileCurrency}>PKR</Text>
          <Text style={styles.figure} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{whole(lastMonth)}</Text>
          <Text style={styles.caption}>Last month</Text>
        </View>
      </View>
    </View>
  );
}

// Two panes you swipe between: what you saved as a requester and what you
// earned as a cardholder. The dots under it are tappable.
export function HolderEarnStats({ stats }) {
  const holder = stats?.holder || {};
  return (
    <View style={[styles.wrap, styles.holderOnly]}>
      <Pane
        width="100%"
        kicker="AS CARDHOLDER · LIFETIME EARNED"
        total={holder.earned_all}
        thisMonth={holder.earned_month}
        lastMonth={holder.earned_last_month}
      />
    </View>
  );
}

export default function StatsSlider({ stats }) {
  const scroller = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const requester = stats?.requester || {};
  const holder = stats?.holder || {};

  const showPage = (index) => {
    if (width > 0) scroller.current?.scrollTo({ x: index * width, animated: true });
  };

  return (
    <View style={styles.wrap}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Animated.ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="start"
            disableIntervalMomentum
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true }
            )}
          >
            <Pane
              width={width}
              kicker="AS REQUESTER · LIFETIME SAVED"
              total={requester.saved_all}
              thisMonth={requester.saved_month}
              lastMonth={requester.saved_last_month}
            />
            <Pane
              width={width}
              kicker="AS CARDHOLDER · LIFETIME EARNED"
              total={holder.earned_all}
              thisMonth={holder.earned_month}
              lastMonth={holder.earned_last_month}
            />
          </Animated.ScrollView>
        ) : null}
      </View>
      <View style={styles.dots}>
        <PageDots
          count={2}
          scrollX={scrollX}
          pageWidth={width}
          labels={['Requester stats', 'Cardholder stats']}
          onSelect={showPage}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.layout.screenPadding,
  },
  holderOnly: {
    marginBottom: theme.spacing.lg,
  },
  page: {
    gap: 12,
  },
  hero: {
    backgroundColor: theme.colors.greenDim,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text2,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  currency: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 44,
    color: theme.colors.text,
  },
  amount: {
    fontFamily: theme.fonts.display,
    fontSize: 38,
    lineHeight: 44,
    color: theme.colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.greenDim,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    minHeight: 80,
    justifyContent: 'space-between',
  },
  tileCurrency: {
    fontFamily: theme.fonts.display,
    fontSize: 14,
    lineHeight: 18,
    color: theme.colors.green,
  },
  figure: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.text,
  },
  caption: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
  dots: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
});
