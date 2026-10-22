import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ALLOWED_BANKS, ALLOWED_CARD_TIERS } from '../api/cards';
import { getCardHolders, getCircle } from '../api/circle';
import { createRequest } from '../api/requester';
import Dropdown from '../components/Dropdown';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import HolderPicker from '../components/HolderPicker';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TextField from '../components/TextField';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { openCircle, openRequests } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList } from '../utils/format';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { productUrlError } from '../utils/productUrl';

export default function CreateRequestScreen() {
  const navigation = useNavigation();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [bank, setBank] = useState('');
  const [tier, setTier] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [appliedKey, setAppliedKey] = useState('');
  const [liveHolderIds, setLiveHolderIds] = useState([]);
  const [merchant, setMerchant] = useState('');
  const [address, setAddress] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const friendsQuery = useScreenQuery(
    ['circle', user?.id],
    async ({ signal }) => asList(await getCircle(sessionId, user.id, { signal }))
  );
  const holdersQuery = useScreenQuery(
    ['card-holders', user?.id, bank, tier],
    async ({ signal }) => asList(await getCardHolders(sessionId, user.id, bank, tier, { signal })),
    Boolean(bank && tier)
  );
  const friends = (friendsQuery.data || []).filter((member) => member.c_status === 'accepted');
  const matchKey = bank && tier ? `${bank}\u0000${tier}` : '';
  const people = matchKey && holdersQuery.data ? personOptions(holdersQuery.data) : [];
  const loadError = friendsQuery.errorMessage || holdersQuery.errorMessage;
  const liveOrder = actionError.startsWith('You already have a live order with ') && liveHolderIds.length > 0;
  const error = liveOrder ? '' : (actionError || loadError);

  useEffect(() => {
    if (!matchKey) {
      setSelectedIds([]);
      setAppliedKey('');
      return;
    }
    if (holdersQuery.data === undefined) return;
    if (appliedKey === matchKey) return;
    setSelectedIds(holdersQuery.data.map((person) => person.id));
    setAppliedKey(matchKey);
  }, [matchKey, holdersQuery.data, appliedKey]);

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
    setBank(value);
    setSelectedIds([]);
    setAppliedKey('');
    clearLiveOrder();
  };

  const onTier = (value) => {
    setTier(value);
    setSelectedIds([]);
    setAppliedKey('');
    clearLiveOrder();
  };

  const onTogglePerson = (id) => {
    clearLiveOrder();
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  const onUnselectAll = () => {
    clearLiveOrder();
    setSelectedIds([]);
  };

  const onUnselectLive = () => {
    const drop = new Set(liveHolderIds);
    setSelectedIds((current) => current.filter((id) => !drop.has(id)));
    setLiveHolderIds([]);
    setActionError('');
  };

  const submit = async () => {
    const parsed = parseWholePkr(amount);
    const chosen = people.filter((person) => selectedIds.includes(person.id));
    if (!bank || !tier) {
      setActionError('Choose a bank and a tier.');
      return;
    }
    if (!chosen.length) {
      setActionError('Choose at least one person.');
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
    const linkError = productUrlError(productUrl);
    if (linkError) {
      setActionError(linkError);
      return;
    }

    setSubmitting(true);
    setActionError('');
    setLiveHolderIds([]);
    try {
      const created = await createRequest(sessionId, user.id, {
        holders: chosen.map((person) => ({
          card_holder_id: person.id,
          card_id: person.card_id,
        })),
        merchant: merchant.trim(),
        delivery_address: address.trim(),
        product_url: productUrl.trim() || null,
        order_amount: parsed,
        note: note.trim() || null,
      });
      const count = Array.isArray(created) ? created.length : 1;
      showToast(count > 1 ? 'Requests sent' : 'Request sent');
      await queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['home', user.id] });
      openRequests(navigation);
    } catch (err) {
      const ids = Array.isArray(err.payload?.holder_ids) ? err.payload.holder_ids : [];
      setLiveHolderIds(ids);
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  let peopleSummary = '';
  let peoplePlaceholder = 'Choose a bank and tier';
  let peopleDisabled = !bank || !tier;
  if (bank && tier) {
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

  return (
    <ScreenShell
      onRefresh={() => {
        friendsQuery.refetch();
        if (bank && tier) holdersQuery.refetch();
      }}
      refreshing={friendsQuery.refreshing || holdersQuery.refreshing}
    >
      <TopBar title="Request order" onBack={() => navigation.goBack()} />
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
          <Text style={styles.hint}>
            Pick a bank and tier. Everyone in your circle who shares that card starts selected. The first to accept places the order. The amount is the price without the card, delivery included. After proof, you pay the card charge plus 20% of the discount.
          </Text>
          <Dropdown label="Bank" placeholder="Choose a bank" options={ALLOWED_BANKS} value={bank} onChange={onBank} />
          <Dropdown label="Tier" placeholder="Choose a tier" options={ALLOWED_CARD_TIERS} value={tier} onChange={onTier} />
          <HolderPicker
            label="People"
            placeholder={peoplePlaceholder}
            summary={peopleSummary}
            people={people}
            selectedIds={selectedIds}
            onToggle={onTogglePerson}
            onUnselectAll={onUnselectAll}
            disabled={peopleDisabled}
          />
          <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="e.g. Daraz" />
          <Field label="Delivery address" value={address} onChangeText={setAddress} placeholder="Full address" multiline />
          <Field label="Product URL (optional)" value={productUrl} onChangeText={setProductUrl} placeholder="https://" />
          <Field label="Price without the card (PKR)" value={amount} onChangeText={onChangeAmount} placeholder="e.g. 2500" keyboardType="number-pad" />
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything they should know" />
          {liveOrder ? (
            <View style={styles.liveRow}>
              <Text style={styles.liveText}>{actionError}</Text>
              <Pressable onPress={onUnselectLive} accessibilityRole="button" accessibilityLabel="Unselect them">
                <Text style={styles.liveAction}>Unselect them</Text>
              </Pressable>
            </View>
          ) : (
            <ErrorBanner message={error} onRetry={friends.length === 0 ? () => friendsQuery.refetch() : undefined} />
          )}
          <PrimaryButton
            label="Start order"
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
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
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
