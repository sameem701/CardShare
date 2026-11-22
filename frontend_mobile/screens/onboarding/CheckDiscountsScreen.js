import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listStoreOffers, searchStores } from '../../api/stores';
import CardPager from '../../components/CardPager';
import Dropdown from '../../components/Dropdown';
import ErrorBanner from '../../components/ErrorBanner';
import LoadingState from '../../components/LoadingState';
import PrimaryButton from '../../components/PrimaryButton';
import TextField from '../../components/TextField';
import VirtualCard from '../../components/VirtualCard';
import theme from '../../constants/theme';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';
import { useTopInset } from '../../hooks/useTopInset';
import { asList } from '../../utils/format';
import { parseWholePkr, wholePkrFromInput } from '../../utils/money';

const CHIPS = [5000, 10000, 20000];

function pkr(n) {
  return `PKR ${Number(n || 0).toLocaleString('en-US')}`;
}

function offLabel(offer) {
  if (offer.discount_percent != null) return `${offer.discount_percent}% OFF`;
  if (offer.discount_flat_pkr != null) return `${pkr(offer.discount_flat_pkr)} OFF`;
  return '';
}

export default function CheckDiscountsScreen({ onInvite, onSkip }) {
  const topInset = useTopInset();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [amount, setAmount] = useState('5000');
  const [own, setOwn] = useState(false);
  const [offers, setOffers] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const amountNum = parseWholePkr(amount) || 0;
  const storeOptions = stores.map((store) => ({ id: String(store.id), label: store.name }));

  useEffect(() => {
    let live = true;
    searchStores(sessionId, user.id, '', { city: user?.city || 'Karachi' })
      .then((rows) => {
        if (!live) return;
        const list = asList(rows);
        setStores(list);
        if (list[0]?.id) setStoreId(String(list[0].id));
        else setLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        setError(err.message);
        setLoading(false);
      });
    return () => { live = false; };
  }, [sessionId, user.id]);

  useEffect(() => {
    if (!storeId) return undefined;
    let live = true;
    setLoading(true);
    listStoreOffers(sessionId, user.id, storeId, amountNum || 5000, { city: user?.city || 'Karachi' })
      .then((result) => {
        if (!live) return;
        setOffers(asList(result?.offers));
        setIndex(0);
        setError('');
      })
      .catch((err) => {
        if (!live) return;
        setError(err.message);
        setOffers([]);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [sessionId, user.id, storeId, amountNum]);

  const current = offers[index] || null;
  const save = current ? Number(current.save_pkr) || 0 : 0;
  const pay = Math.max(0, amountNum - save);

  const calc = useMemo(() => {
    if (!amountNum) return { kind: 'none', text: 'Enter your order amount' };
    if (!current) return { kind: 'none', text: 'No Peekaboo offers at this store yet.' };
    if (!save) {
      return {
        kind: 'none',
        text: `This card needs an order of ${pkr(current.min_order_pkr)} or more`,
      };
    }
    return { kind: 'ok', save, pay };
  }, [amountNum, current, save, pay]);

  const onChangeAmount = (value) => {
    const next = wholePkrFromInput(value);
    setAmount(next.amount);
    setOwn(true);
  };

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <Pressable onPress={onSkip} style={styles.skip} accessibilityRole="button">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
      <Text style={styles.title}>Check your discounts</Text>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} keyboardShouldPersistTaps="handled">
        <Dropdown
          label="Store"
          placeholder="Choose a store"
          options={storeOptions}
          value={storeId}
          onChange={setStoreId}
        />
        <View style={styles.amtHead}>
          <Text style={styles.label}>{own ? 'Your amount' : 'Example order'}</Text>
          <Pressable
            onPress={() => {
              if (own) {
                setOwn(false);
                setAmount('5000');
              } else setOwn(true);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.link}>{own ? 'Examples' : 'Own amount'}</Text>
          </Pressable>
        </View>
        <View style={styles.chips}>
          {CHIPS.map((value) => {
            const on = Number(amount) === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setOwn(false);
                  setAmount(String(value));
                }}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {value === 5000 ? '5k' : value === 10000 ? '10k' : '20k'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {own ? (
          <TextField
            value={amount ? pkr(amount) : ''}
            onChangeText={onChangeAmount}
            placeholder="PKR"
            keyboardType="number-pad"
            accessibilityLabel="Order amount"
          />
        ) : null}

        <View style={[styles.calc, calc.kind === 'none' && styles.calcNone]}>
          {calc.kind === 'none' ? (
            <Text style={styles.calcHint}>{calc.text}</Text>
          ) : (
            <View style={styles.calcRow}>
              <View>
                <Text style={styles.cap}>You save</Text>
                <Text style={styles.big}>{pkr(calc.save)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cap}>You pay</Text>
                <Text style={styles.pay}>{pkr(calc.pay)}</Text>
              </View>
            </View>
          )}
        </View>

        {loading ? <LoadingState /> : null}
        <ErrorBanner message={error} />
        {!loading && offers.length > 0 ? (
          <>
            <Text style={styles.cardsLabel}>Cards</Text>
            <CardPager
              items={offers}
              keyOf={(item) => `${item.bank_name}-${item.card_tier}-${item.first_order_only}`}
              resetKey={`${storeId}-${amount}`}
              onIndexChange={setIndex}
              dotsLabel="Card"
              renderItem={(item) => (
                <View style={styles.slide}>
                  <VirtualCard bankName={item.bank_name} cardTier={item.card_tier} displayName="" />
                  {offLabel(item) ? <Text style={styles.off}>{offLabel(item)}</Text> : null}
                </View>
              )}
            />
          </>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <Text style={styles.hook}>
          Don't have the card?{'\n'}
          <Text style={styles.hookStrong}>Someone you trust might.</Text>
        </Text>
        <PrimaryButton
          label="Invite friends & family"
          onPress={() => {
            if (!amountNum) {
              showToast('Enter the order amount');
              return;
            }
            onInvite();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 20,
  },
  skip: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    color: theme.colors.text,
    marginBottom: 16,
  },
  body: {
    flex: 1,
  },
  bodyInner: {
    gap: 10,
    paddingBottom: 12,
  },
  amtHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  link: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: theme.colors.bg3,
  },
  chipOn: {
    backgroundColor: theme.colors.greenDim,
  },
  chipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  chipTextOn: {
    color: theme.colors.text,
  },
  calc: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: 16,
  },
  calcNone: {
    alignItems: 'center',
  },
  calcHint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    textAlign: 'center',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cap: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  big: {
    marginTop: 4,
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.text,
  },
  pay: {
    marginTop: 4,
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.text,
  },
  cardsLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  slide: {
    paddingRight: 12,
  },
  off: {
    position: 'absolute',
    right: 28,
    bottom: 16,
    fontFamily: theme.fonts.display,
    fontSize: 16,
    color: theme.colors.green,
  },
  bar: {
    paddingVertical: 16,
    gap: 12,
  },
  hook: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 20,
    color: theme.colors.text2,
  },
  hookStrong: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyMedium,
  },
});
