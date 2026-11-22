import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { applyStore, searchStores } from '../api/stores';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { asList } from '../utils/format';
import { initialsFor } from '../utils/initials';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { pickStoreMatch, storeQueryFromUrl } from '../utils/storeLink';
import { useScreenQuery } from '../queries/useScreenQuery';
import CircleCardViewer from './CircleCardViewer';
import Dropdown from './Dropdown';
import ErrorBanner from './ErrorBanner';
import LoadingState from './LoadingState';
import PrimaryButton from './PrimaryButton';
import TextField from './TextField';

const CITY_OPTIONS = ['Karachi', 'Lahore', 'Islamabad'];
const MAX_ASK = 5;

function PickCheck({ on, best }) {
  return (
    <View style={[styles.pick, best && styles.pickBest, on && styles.pickOn]} pointerEvents="none">
      {on ? (
        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
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

function pkr(n) {
  if (n == null || n === '') return '—';
  return `PKR ${Number(n).toLocaleString('en-US')}`;
}

function discountLabel(row) {
  if (row.discount_percent != null) return `${row.discount_percent}% off`;
  if (row.discount_flat_pkr != null) return `${pkr(row.discount_flat_pkr)} off`;
  return '—';
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'them';
}

function displayName(row) {
  return row.contact_name || row.display_name || row.phone || 'Someone';
}

function cityChoices(userCity) {
  const current = String(userCity || '').trim();
  if (current && !CITY_OPTIONS.includes(current)) return [current, ...CITY_OPTIONS];
  return CITY_OPTIONS;
}

export default function HomeFind({
  people,
  sharingLoading,
  sharingError,
  onRetrySharing,
  onRequestCard,
  onAsk,
  onInvite,
  onDockChange,
}) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [way, setWay] = useState('store');
  const [entry, setEntry] = useState('link');
  const [url, setUrl] = useState('');
  const [storeId, setStoreId] = useState('');
  const [city, setCity] = useState(() => {
    const fromUser = String(user?.city || '').trim();
    return fromUser || 'Karachi';
  });
  const [amount, setAmount] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState({});
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const storesQuery = useScreenQuery(
    ['stores', user?.id, city],
    async ({ signal }) => asList(await searchStores(sessionId, user.id, '', { signal, city })),
    way === 'store'
  );
  const storeOptions = (storesQuery.data || []).map((store) => ({
    id: String(store.id),
    label: store.name,
  }));
  const cities = cityChoices(user?.city);

  useEffect(() => {
    setResult(null);
    setSelectedIds([]);
    setStoreId('');
  }, [city]);
  const amountNum = parseWholePkr(amount);
  const applyReady = entry === 'store' ? Boolean(storeId) : Boolean(String(url).trim());
  const applyLabel = !applyReady
    ? (entry === 'store' ? 'Pick a store' : 'Paste a link')
    : (amountNum == null || amountNum <= 0 ? 'Enter order amount' : 'Apply');

  const onChangeAmount = (value) => {
    const next = wholePkrFromInput(value);
    setAmount(next.amount);
    setError(next.rejectedDecimal ? 'Enter a whole number of PKR, without paisa.' : '');
  };

  const runApply = async () => {
    if (applyLabel !== 'Apply') return;
    setApplying(true);
    setError('');
    setResult(null);
    setBlockedOpen(false);
    try {
      let chosen = null;
      if (entry === 'store') {
        chosen = (storesQuery.data || []).find((store) => String(store.id) === String(storeId));
      } else {
        const q = storeQueryFromUrl(url);
        const matches = asList(await searchStores(sessionId, user.id, q, { city }));
        chosen = pickStoreMatch(matches, q);
      }
      if (!chosen?.id) {
        setResult({
          store: null,
          has_catalog: false,
          miss: 'no_store',
          people: [],
          blocked: [],
        });
        return;
      }
      const applied = await applyStore(sessionId, user.id, chosen.id, amountNum, { city });
      setSelectedIds([]);
      setResult(applied || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const hits = asList(result?.people);
  const blocked = asList(result?.blocked);
  const capIds = hits.map((row) => row.holder_id).slice(0, MAX_ASK);
  const selectedSet = new Set(selectedIds);
  const allOn = capIds.length > 0
    && capIds.every((id) => selectedSet.has(id))
    && selectedIds.every((id) => capIds.includes(id));
  const dockVisible = way === 'store' && hits.length > 0;

  const togglePerson = (id) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_ASK) {
        showToast('Ask up to 5 people');
        return current;
      }
      return [...current, id];
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) => {
      const on = capIds.length > 0
        && capIds.every((id) => current.includes(id))
        && current.every((id) => capIds.includes(id));
      return on ? [] : capIds.slice();
    });
  };

  const requestSelected = () => {
    const chosen = hits.filter((row) => selectedSet.has(row.holder_id)).slice(0, MAX_ASK);
    if (!chosen.length) return;
    onAsk(chosen, result.store, amountNum, entry === 'link' ? url : '');
  };

  useEffect(() => {
    onDockChange?.({
      visible: dockVisible,
      allOn,
      ready: selectedIds.length > 0,
      onToggleAll: toggleAll,
      onRequest: requestSelected,
    });
  }, [dockVisible, allOn, selectedIds, hits, amountNum, entry, url, result?.store]);

  useEffect(() => () => onDockChange?.({ visible: false }), [onDockChange]);
  const topSave = useMemo(
    () => hits.reduce((max, row) => Math.max(max, Number(row.save_pkr) || 0), 0),
    [hits]
  );
  const showInvite = Boolean(result) && hits.length === 0;

  let missTitle = '';
  let missText = '';
  if (result && hits.length === 0) {
    const storeName = result.store?.name || 'this store';
    if (result.miss === 'no_store' || !result.has_catalog) {
      missTitle = 'No offer found';
      missText = `We don’t have a Peekaboo offer at ${storeName} yet.`;
    } else if (blocked.length) {
      const first = blocked[0];
      if (first.block_reason === 'below_min') {
        missTitle = 'Order is below the minimum';
        missText = `${firstName(displayName(first))}’s ${first.bank_name} ${first.card_tier} needs an order of ${pkr(first.min_order_pkr)} or more at ${storeName}.`;
      } else {
        missTitle = 'Won’t work on this order';
        missText = `${firstName(displayName(first))}’s ${first.bank_name} ${first.card_tier} isn’t valid today at ${storeName}.`;
      }
    } else {
      missTitle = 'No offer found';
      missText = `Nobody in your circle has an offer at ${storeName}.`;
    }
  }

  return (
    <View>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{way === 'store' ? 'Find the best card' : 'Cards in your circle'}</Text>
        <Text style={styles.heroText}>
          {way === 'store'
            ? 'Paste a link or pick a store. We’ll rank people in your circle by what this order actually saves.'
            : 'Request a card someone is already sharing.'}
        </Text>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        <Pressable
          style={[styles.tab, way === 'store' && styles.tabOn]}
          onPress={() => setWay('store')}
          accessibilityRole="tab"
          accessibilityState={{ selected: way === 'store' }}
        >
          <Text style={[styles.tabText, way === 'store' && styles.tabTextOn]}>By store</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, way === 'card' && styles.tabOn]}
          onPress={() => setWay('card')}
          accessibilityRole="tab"
          accessibilityState={{ selected: way === 'card' }}
        >
          <Text style={[styles.tabText, way === 'card' && styles.tabTextOn]}>By card</Text>
        </Pressable>
      </View>

      {way === 'card' ? (
        <>
          {sharingLoading ? <LoadingState /> : <CircleCardViewer people={people} onRequest={onRequestCard} />}
          <View style={styles.pad}>
            <ErrorBanner message={sharingError} onRetry={onRetrySharing} />
          </View>
        </>
      ) : (
        <View style={styles.pad}>
          <Text style={styles.label}>Product link or store</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, entry === 'link' && styles.modeOn]}
              onPress={() => setEntry('link')}
            >
              <Text style={[styles.modeText, entry === 'link' && styles.modeTextOn]}>Paste a link</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, entry === 'store' && styles.modeOn]}
              onPress={() => setEntry('store')}
            >
              <Text style={[styles.modeText, entry === 'store' && styles.modeTextOn]}>Pick a store</Text>
            </Pressable>
          </View>
          {entry === 'link' ? (
            <TextField
              value={url}
              onChangeText={setUrl}
              placeholder="Paste a product link"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          ) : (
            <Dropdown
              label="Store"
              placeholder="Choose a store"
              options={storeOptions}
              value={storeId}
              onChange={setStoreId}
            />
          )}
          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <Dropdown label="City" placeholder="City" options={cities} value={city} onChange={setCity} />
            </View>
            <View style={styles.pairItem}>
              <Text style={styles.label}>Order amount</Text>
              <TextField
                value={amount ? `PKR ${Number(amount).toLocaleString('en-US')}` : amount}
                onChangeText={onChangeAmount}
                placeholder="PKR"
                keyboardType="number-pad"
                accessibilityLabel="Order amount"
              />
            </View>
          </View>
          <ErrorBanner message={error || (entry === 'store' ? storesQuery.errorMessage : '')} />
          <PrimaryButton
            label={applyLabel}
            loading={applying}
            disabled={applyLabel !== 'Apply'}
            onPress={runApply}
          />

          {result && hits.length > 0 ? (
            <View style={styles.results}>
              <Text style={styles.resultsHead}>
                {hits.length} in your circle can do this · ranked by saving
                {hits.length > MAX_ASK ? ' · ask up to 5' : ''}
              </Text>
              {hits.map((row) => {
                const name = displayName(row);
                const best = topSave > 0 && row.save_pkr === topSave;
                const pay = Math.max(0, amountNum - (row.save_pkr || 0));
                const open = Boolean(detailsOpen[row.holder_id]);
                const picked = selectedSet.has(row.holder_id);
                const locked = selectedIds.length >= MAX_ASK && !picked;
                return (
                  <Pressable
                    key={`${row.holder_id}-${row.card_id}`}
                    style={[styles.offer, best && styles.offerBest, picked && styles.offerOn, locked && styles.offerLocked]}
                    onPress={() => togglePerson(row.holder_id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: picked, disabled: locked }}
                    accessibilityLabel={`Select ${name}`}
                  >
                    <PickCheck on={picked} best={best} />
                    {best ? <Text style={styles.flag}>Best match</Text> : null}
                    <View style={styles.who}>
                      <View style={styles.av}><Text style={styles.avText}>{initialsFor(name)}</Text></View>
                      <View style={{ flex: 1, paddingRight: 28 }}>
                        <Text style={styles.whoName}>{name}</Text>
                        <Text style={styles.whoCard}>{row.bank_name} · {row.card_tier}</Text>
                      </View>
                    </View>
                    <View style={styles.money}>
                      <View>
                        <Text style={styles.cap}>You save</Text>
                        <Text style={styles.moneyVal}>{pkr(row.save_pkr)}</Text>
                      </View>
                      <View>
                        <Text style={styles.cap}>You pay</Text>
                        <Text style={styles.moneyVal}>{pkr(pay)}</Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => setDetailsOpen((current) => ({ ...current, [row.holder_id]: !current[row.holder_id] }))}
                      accessibilityRole="button"
                    >
                      <Text style={styles.detailsToggle}>{open ? 'Hide details' : 'Details'}</Text>
                    </Pressable>
                    {open ? (
                      <View style={styles.facts}>
                        <Fact label="Discount" value={discountLabel(row)} />
                        <Fact label="Max cap" value={row.cap_pkr != null ? pkr(row.cap_pkr) : '—'} />
                        <Fact label="Min order" value={row.min_order_pkr != null ? pkr(row.min_order_pkr) : '—'} />
                        {row.promo_code ? <Fact label="Promo" value={row.promo_code} /> : null}
                        {row.first_order_only ? <Fact label="Limit" value="First order only" /> : null}
                      </View>
                    ) : null}
                    <Pressable
                      style={[styles.ask, best ? styles.askBest : styles.askGhost]}
                      onPress={() => onAsk([row], result.store, amountNum, entry === 'link' ? url : '')}
                      accessibilityRole="button"
                      accessibilityLabel={`Ask ${firstName(name)}`}
                    >
                      <Text style={[styles.askText, !best && styles.askGhostText]}>Ask {firstName(name)}</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {result && hits.length === 0 ? (
            <View style={styles.miss}>
              <Text style={styles.missTitle}>{missTitle}</Text>
              <Text style={styles.missText}>{missText}</Text>
            </View>
          ) : null}

          {blocked.length > 0 && hits.length > 0 ? (
            <>
              <Pressable
                style={styles.deadToggle}
                onPress={() => setBlockedOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: blockedOpen }}
              >
                <Text style={styles.deadLabel}>Won’t work on this order</Text>
                <Text style={styles.deadCount}>{blocked.length}</Text>
              </Pressable>
              {blockedOpen ? blocked.map((row) => (
                <View key={`b-${row.holder_id}-${row.card_id}`} style={styles.deadRow}>
                  <Text style={styles.whoName}>{displayName(row)}</Text>
                  <Text style={styles.whoCard}>{row.bank_name} · {row.card_tier}</Text>
                  <Text style={styles.blockReason}>
                    {row.block_reason === 'below_min'
                      ? `Min order ${pkr(row.min_order_pkr)}`
                      : 'Not valid today'}
                  </Text>
                </View>
              )) : null}
            </>
          ) : null}

          {showInvite ? (
            <Pressable style={styles.invite} onPress={onInvite} accessibilityRole="button">
              <Text style={styles.inviteText}>Invite someone else</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.md,
  },
  heroTitle: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    lineHeight: theme.lineHeight.hero,
    color: theme.colors.text,
  },
  heroText: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text2,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.bg3,
    borderRadius: theme.radius.control,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabOn: {
    backgroundColor: theme.colors.bg,
  },
  tabText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  tabTextOn: {
    color: theme.colors.text,
  },
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg3,
  },
  modeOn: {
    backgroundColor: theme.colors.greenDim,
  },
  modeText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  modeTextOn: {
    color: theme.colors.text,
  },
  pair: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  pairItem: {
    flex: 1,
  },
  results: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  resultsHead: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
  },
  offer: {
    position: 'relative',
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  offerBest: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.greenDim2,
  },
  offerOn: {
    borderColor: theme.colors.green,
  },
  offerLocked: {
    opacity: 0.55,
  },
  pick: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border2,
    backgroundColor: theme.colors.bg3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pickBest: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pickOn: {
    backgroundColor: theme.colors.green,
    borderColor: theme.colors.green,
  },
  flag: {
    alignSelf: 'flex-start',
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.caption,
    color: theme.colors.greenDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  av: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 12,
    color: theme.colors.greenDark,
  },
  whoName: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  whoCard: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.text2,
    marginTop: 2,
  },
  money: {
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
  moneyVal: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.text,
    marginTop: 2,
  },
  detailsToggle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
  facts: {
    gap: 6,
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  factLabel: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  factVal: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
  ask: {
    borderRadius: theme.radius.control,
    paddingVertical: 12,
    alignItems: 'center',
  },
  askBest: {
    backgroundColor: theme.colors.green,
  },
  askGhost: {
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  askText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.black,
  },
  askGhostText: {
    color: theme.colors.text,
  },
  miss: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: 8,
  },
  missTitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  missText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: theme.lineHeight.body,
    color: theme.colors.text2,
  },
  deadToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  deadLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  deadCount: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  deadRow: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.control,
    padding: theme.spacing.md,
    gap: 4,
  },
  blockReason: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.amber,
  },
  invite: {
    marginTop: 4,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  inviteText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
});
