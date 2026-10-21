import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatPkr } from '../utils/format';

function lifetimeLine(count) {
  return `${count} lifetime ${count === 1 ? 'order' : 'orders'}`;
}

function pkrParts(amount) {
  const formatted = formatPkr(amount);
  if (!formatted.startsWith('PKR ')) return { label: '', value: formatted };
  return { label: 'PKR', value: formatted.slice(4) };
}

function MonthMoney({ amount }) {
  const { label, value } = pkrParts(amount);
  return (
    <View>
      {label ? <Text style={styles.tileCurrency}>{label}</Text> : null}
      <Text style={[styles.figure, styles.green]}>{value}</Text>
    </View>
  );
}

function TotalMoney({ amount }) {
  const { label, value } = pkrParts(amount);
  if (!label) {
    return <Text style={styles.amount}>{value}</Text>;
  }
  return (
    <Text style={styles.currency}>
      PKR <Text style={styles.amount}>{value}</Text>
    </Text>
  );
}

export default function HomeStats({ stats }) {
  const scroller = useRef(null);
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);

  if (!stats) return null;

  const showPage = (index) => {
    setPage(index);
    if (width > 0) scroller.current?.scrollTo({ x: index * width, animated: true });
  };

  return (
    <View style={styles.wrap}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="start"
            disableIntervalMomentum
            onMomentumScrollEnd={(event) => {
              const next = Math.round(event.nativeEvent.contentOffset.x / width);
              setPage(next === 1 ? 1 : 0);
            }}
          >
            <View style={[styles.page, { width }]}>
              <View style={styles.hero}>
                <Text style={styles.kicker}>Total earned</Text>
                <TotalMoney amount={stats.earnedAll} />
                <Text style={styles.sub}>{lifetimeLine(stats.holderOrders)}</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.tile}>
                  <MonthMoney amount={stats.earnedMonth} />
                  <Text style={styles.caption}>Earned this month</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={[styles.figure, styles.count]}>{stats.holderOrdersMonth}</Text>
                  <Text style={styles.caption}>Orders this month</Text>
                </View>
              </View>
            </View>
            <View style={[styles.page, { width }]}>
              <View style={styles.hero}>
                <Text style={styles.kicker}>Total saved</Text>
                <TotalMoney amount={stats.savedAll} />
                <Text style={styles.sub}>{lifetimeLine(stats.requesterOrders)}</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.tile}>
                  <MonthMoney amount={stats.savedMonth} />
                  <Text style={styles.caption}>Saved this month</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={[styles.figure, styles.count]}>{stats.requesterOrdersMonth}</Text>
                  <Text style={styles.caption}>Orders this month</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>
      <View style={styles.dots}>
        <Pressable
          onPress={() => showPage(0)}
          style={[styles.dot, page === 0 && styles.dotOn]}
          accessibilityRole="button"
          accessibilityLabel="Earned"
        />
        <Pressable
          onPress={() => showPage(1)}
          style={[styles.dot, page === 1 && styles.dotOn]}
          accessibilityRole="button"
          accessibilityLabel="Saved"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  page: {
    gap: theme.spacing.md,
  },
  hero: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  currency: {
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 44,
    color: theme.colors.text,
  },
  amount: {
    fontFamily: theme.fonts.display,
    fontSize: 42,
    lineHeight: 46,
    color: theme.colors.text,
  },
  sub: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  tileCurrency: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.green,
    marginBottom: 2,
  },
  figure: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.text,
  },
  green: {
    color: theme.colors.green,
  },
  count: {
    fontSize: theme.fontSize.hero,
    lineHeight: theme.lineHeight.hero,
  },
  caption: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dotOn: {
    width: 18,
    backgroundColor: theme.colors.green,
  },
});
