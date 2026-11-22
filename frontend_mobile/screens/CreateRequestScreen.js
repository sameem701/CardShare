import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getBanks, getTiers } from '../api/cards';
import { getCardHolders, getCircle } from '../api/circle';
import { createRequest } from '../api/requester';
import Dropdown from '../components/Dropdown';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import HolderPicker from '../components/HolderPicker';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ProductRows from '../components/ProductRows';
import ScreenShell from '../components/ScreenShell';
import TextField from '../components/TextField';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { openCircle, openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList } from '../utils/format';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { blankProduct, cleanProductRows } from '../utils/products';

const MAX_ASK = 5;

export default function CreateRequestScreen() {
  const navigation = useNavigation();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const preset = useRoute().params || {};
  const findPeople = asList(preset.findPeople);
  const [bank, setBank] = useState(preset.bank || '');
  const [tier, setTier] = useState(preset.tier || '');
  const [presetActive, setPresetActive] = useState(Boolean(preset.holderId || findPeople.length));
  const [selectedIds, setSelectedIds] = useState([]);
  const [appliedKey, setAppliedKey] = useState('');
  const [liveHolderIds, setLiveHolderIds] = useState([]);
  const [merchant, setMerchant] = useState(preset.merchant || '');
  const [address, setAddress] = useState('');
  const [products, setProducts] = useState([blankProduct(preset.productUrl || '')]);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState(preset.amount ? String(preset.amount) : '');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [offer, setOffer] = useState(preset.offer || null);

  const friendsQuery = useScreenQuery(
    ['circle', user?.id],
    async ({ signal }) => asList(await getCircle(sessionId, user.id, { signal }))
  );
  const banksQuery = useScreenQuery(
    ['banks'],
    async ({ signal }) => asList(await getBanks(sessionId, user.id, { signal }))
  );
  const tiersQuery = useScreenQuery(
    ['tiers'],
    async ({ signal }) => asList(await getTiers(sessionId, user.id, { signal }))
  );
  const holdersQuery = useScreenQuery(
    ['card-holders', user?.id, bank, tier],
    async ({ signal }) => asList(await getCardHolders(sessionId, user.id, bank, tier, { signal })),
    Boolean(bank && tier)
  );
  const friends = (friendsQuery.data || []).filter((member) => member.c_status === 'accepted');
  const matchKey = bank && tier ? `${bank}\u0000${tier}` : '';
  const people = presetActive && findPeople.length
    ? findPeople.map((person) => ({
      id: person.id,
      label: person.label || person.id,
      card_id: person.card_id,
      offer: person.offer,
    }))
    : (matchKey && holdersQuery.data ? personOptions(holdersQuery.data) : []);
  const banks = banksQuery.data || [];
  const tiers = tiersQuery.data || [];
  const loadError = friendsQuery.errorMessage || holdersQuery.errorMessage
    || banksQuery.errorMessage || tiersQuery.errorMessage;
  const liveOrder = actionError.startsWith('You already have a live order with ') && liveHolderIds.length > 0;
  const error = liveOrder ? '' : (actionError || loadError);
  const chosen = people.filter((person) => selectedIds.includes(person.id));
  const showBankFields = !(presetActive && findPeople.length);

  useEffect(() => {
    if (presetActive && findPeople.length) {
      const key = matchKey || 'find';
      if (appliedKey === key) return;
      setSelectedIds(findPeople.map((person) => person.id).slice(0, MAX_ASK));
      setAppliedKey(key);
      return;
    }
    if (!matchKey) {
      setSelectedIds([]);
      setAppliedKey('');
      return;
    }
    if (holdersQuery.data === undefined) return;
    if (appliedKey === matchKey) return;
    const onlyThem = presetActive && holdersQuery.data.some((person) => person.id === preset.holderId);
    const ids = onlyThem ? [preset.holderId] : holdersQuery.data.map((person) => person.id);
    setSelectedIds(ids.slice(0, MAX_ASK));
    setAppliedKey(matchKey);
  }, [matchKey, holdersQuery.data, appliedKey, presetActive, preset.holderId, findPeople]);

  const clearLiveOrder = () => {
    setLiveHolderIds([]);
    setActionError((current) => (
      current.startsWith('You already have a live order with ') ? '' : current
    ));
  };

  const onChangeAmount = (value) => {
    const next = wholePkrFromInput(value);
    setAmount(next.amount);
    if (next.rejectedDecimal) setActionError('Enter a whole number of PKR, without paisa.');
    else setActionError('');
  };

  const onBank = (value) => {
    setPresetActive(false);
    setOffer(null);
    setBank(value);
    setSelectedIds([]);
    setAppliedKey('');
    clearLiveOrder();
  };

  const onTier = (value) => {
    setPresetActive(false);
    setOffer(null);
    setTier(value);
    setSelectedIds([]);
    setAppliedKey('');
    clearLiveOrder();
  };

  const onTogglePerson = (id) => {
    clearLiveOrder();
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_ASK) {
        setActionError('Ask up to 5 people.');
        return current;
      }
      setActionError('');
      return [...current, id];
    });
  };

  const submit = async () => {
    const parsed = parseWholePkr(amount);
    if (showBankFields && (!bank || !tier)) {
      setActionError('Choose a bank and a tier.');
      return;
    }
    if (!chosen.length) {
      setActionError('Choose at least one person.');
      return;
    }
    if (chosen.length > MAX_ASK) {
      setActionError('Ask up to 5 people.');
      return;
    }
    if (!merchant.trim()) {
      setActionError('Merchant is required.');
      return;
    }
    if (!address.trim()) {
      setActionError('Delivery address is required.');
      return;
    }
    if (parsed == null || parsed <= 100) {
      setActionError('Order amount must be a whole number greater than 100 PKR.');
      return;
    }
    const parsedProducts = cleanProductRows(products);
    if (parsedProducts.error) {
      setActionError(parsedProducts.error);
      return;
    }
    const cleanedProducts = parsedProducts.products;

    setSubmitting(true);
    setActionError('');
    setLiveHolderIds([]);
    try {
      const snapshot = offer || chosen[0]?.offer || null;
      const created = await createRequest(sessionId, user.id, {
        holders: chosen.map((person) => ({
          card_holder_id: person.id,
          card_id: (presetActive && findPeople.find((item) => item.id === person.id)?.card_id)
            || (presetActive && person.id === preset.holderId && preset.cardId)
            || person.card_id,
        })),
        merchant: merchant.trim(),
        delivery_address: address.trim(),
        product_url: cleanedProducts[0]?.product_url || null,
        order_amount: parsed,
        note: note.trim() || null,
        products: cleanedProducts,
        ...(snapshot ? { offer: snapshot } : {}),
      });
      const list = Array.isArray(created) ? created : [created];
      const count = list.length;
      showToast(count > 1 ? 'Requests sent' : 'Request sent');
      await queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['home', user.id] });
      if (count > 1 && list[0]?.order_group_id) {
        openScreen(navigation, 'broadcast', { groupId: list[0].order_group_id }, { replace: true });
      } else if (list[0]?.id) {
        openScreen(navigation, 'order', { requestId: list[0].id }, { replace: true });
      }
    } catch (err) {
      const ids = Array.isArray(err.payload?.holder_ids) ? err.payload.holder_ids : [];
      setLiveHolderIds(ids);
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  let peopleSummary = '';
  let peoplePlaceholder = 'Choose a bank and a tier';
  let peopleDisabled = !bank || !tier;
  if (presetActive && findPeople.length) {
    peopleDisabled = false;
    if (selectedIds.length === 0) peopleSummary = 'None selected';
    else peopleSummary = selectedIds.length === 1 ? '1 selected' : `${selectedIds.length} selected`;
  } else if (bank && tier) {
    if (holdersQuery.showLoading) {
      peoplePlaceholder = 'Loading…';
      peopleDisabled = true;
    } else if (holdersQuery.errorMessage) {
      peoplePlaceholder = 'Could not load people';
      peopleDisabled = true;
    } else if (people.length === 0) {
      peoplePlaceholder = 'No options';
    } else if (selectedIds.length === 0) {
      peopleSummary = 'None selected';
    } else {
      peopleSummary = selectedIds.length === 1 ? '1 selected' : `${selectedIds.length} selected`;
    }
  }

  const sendLabel = chosen.length <= 1
    ? (chosen[0] ? `Send to ${String(chosen[0].label || '').split(/\s+/)[0]}` : 'Send')
    : `Send to ${chosen.length} people`;

  return (
    <ScreenShell
      onRefresh={() => {
        friendsQuery.refetch();
        if (bank && tier) holdersQuery.refetch();
      }}
      refreshing={friendsQuery.refreshing || holdersQuery.refreshing}
    >
      <TopBar
        title="Request details"
        onBack={() => navigation.goBack()}
        right={(
          <Pressable
            onPress={() => {
              setMerchant('Daraz');
              setAmount('12000');
              setAddress('House 12, Street 4, DHA Phase 6, Karachi');
              setNote('Please pack carefully and include the receipt');
              setProducts([
                { ...blankProduct('', false), title: 'Nike Air Max 90', url: 'https://www.daraz.pk/products/nike-air-max-90-i1234', qty: 1 },
                { ...blankProduct('', false), title: 'Phone case', qty: 2, note: 'Black, matte finish' },
                { ...blankProduct('', false), title: 'Screen protector', url: 'https://www.daraz.pk/products/glass-protector', qty: 1, note: 'Size for iPhone 15' },
              ]);
            }}
            style={styles.ghost}
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>Test data</Text>
          </Pressable>
        )}
      />
      {friendsQuery.showLoading ? (
        <LoadingState />
      ) : friends.length === 0 && !friendsQuery.errorMessage ? (
        <View style={styles.pad}>
          <EmptyState message="Add someone to your circle first, and make sure they share a card." />
          <Pressable onPress={() => openCircle(navigation)}>
            <Text style={styles.link}>Go to Circle</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pad}>
          <Text style={styles.kicker}>To</Text>
          <View style={styles.chips}>
            {chosen.map((person) => (
              <Pressable
                key={person.id}
                onPress={() => onTogglePerson(person.id)}
                style={styles.chip}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${person.label}`}
              >
                <Text style={styles.chipText}>{person.label}</Text>
                <Text style={styles.chipX}>×</Text>
              </Pressable>
            ))}
          </View>
          {showBankFields ? (
            <>
              <Dropdown label="Bank" placeholder="Choose a bank" options={banks} value={bank} onChange={onBank} />
              <Dropdown label="Tier" placeholder="Choose a tier" options={tiers} value={tier} onChange={onTier} />
              <HolderPicker
                label="People"
                placeholder={peoplePlaceholder}
                summary={peopleSummary}
                people={people}
                selectedIds={selectedIds}
                onToggle={onTogglePerson}
                onUnselectAll={() => { clearLiveOrder(); setSelectedIds([]); }}
                disabled={peopleDisabled}
              />
            </>
          ) : (
            <HolderPicker
              label="People"
              placeholder={peoplePlaceholder}
              summary={peopleSummary}
              people={people}
              selectedIds={selectedIds}
              onToggle={onTogglePerson}
              onUnselectAll={() => { clearLiveOrder(); setSelectedIds([]); }}
              disabled={peopleDisabled}
            />
          )}
          <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="e.g. Daraz" />
          <Field
            label="Price without a card (PKR)"
            value={amount}
            onChangeText={onChangeAmount}
            placeholder="e.g. 8500"
            keyboardType="number-pad"
          />
          <Field label="Delivery address" value={address} onChangeText={setAddress} placeholder="Full address" multiline />
          <Text style={styles.label}>Products</Text>
          <ProductRows products={products} onChange={setProducts} />
          <Field label="Notes" value={note} onChangeText={setNote} placeholder="Optional" />
          {liveOrder ? (
            <View style={styles.liveRow}>
              <Text style={styles.liveText}>{actionError}</Text>
              <Pressable onPress={() => {
                const drop = new Set(liveHolderIds);
                setSelectedIds((current) => current.filter((id) => !drop.has(id)));
                setLiveHolderIds([]);
                setActionError('');
              }} accessibilityRole="button" accessibilityLabel="Unselect them">
                <Text style={styles.liveAction}>Unselect them</Text>
              </Pressable>
            </View>
          ) : (
            <ErrorBanner message={error} />
          )}
          <PrimaryButton
            label={sendLabel}
            loading={submitting}
            disabled={selectedIds.length === 0}
            onPress={submit}
          />
        </View>
      )}
    </ScreenShell>
  );
}

function personOptions(people) {
  const labels = people.map((person) => person.contact_name || person.display_name || person.phone || person.id);
  const counts = labels.reduce((map, label) => {
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  return people.map((person, index) => {
    const base = labels[index];
    const label = counts[base] > 1 && person.phone ? `${base} · ${person.phone}` : base;
    return { id: person.id, label, card_id: person.card_id };
  });
}

function Field({ label, multiline, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextField {...props} multiline={multiline} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
  },
  kicker: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.bg2,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  chipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
  chipX: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text3,
  },
  link: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
    marginTop: theme.spacing.md,
  },
  field: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  ghost: {
    borderWidth: 1,
    borderColor: theme.colors.border2,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  ghostText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.text2,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.redDim,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  liveText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
  },
  liveAction: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
});
