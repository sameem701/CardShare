import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import TextField from '../components/TextField';
import { getCircle, getCircleCards } from '../api/circle';
import { createRequest } from '../api/requester';
import Dropdown from '../components/Dropdown';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { asList } from '../utils/format';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { productUrlError } from '../utils/productUrl';

export default function CreateRequestScreen({ onBack, onNavigate, onOpenCircle }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [friends, setFriends] = useState([]);
  const [cards, setCards] = useState([]);
  const [friendId, setFriendId] = useState('');
  const [cardId, setCardId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [address, setAddress] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadFriends = useCallback(async () => {
    setError('');
    try {
      const rows = await getCircle(sessionId, user.id);
      const accepted = asList(rows).filter((m) => m.c_status === 'accepted');
      setFriends(accepted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, user.id]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const loadCards = useCallback(async (id) => {
    if (!id) {
      setCards([]);
      setCardId('');
      return;
    }
    try {
      const rows = await getCircleCards(sessionId, user.id, id);
      setCards(asList(rows));
      setCardId('');
    } catch (err) {
      setError(err.message);
      setCards([]);
    }
  }, [sessionId, user.id]);

  const onPickFriend = (id) => {
    setFriendId(id);
    loadCards(id);
  };

  const onChangeAmount = (value) => {
    const next = wholePkrFromInput(value);
    setAmount(next.amount);
    if (next.rejectedDecimal) setError('Enter a whole number of PKR, without paisa.');
    else setError('');
  };

  const submit = async () => {
    const parsed = parseWholePkr(amount);
    if (!friendId || !cardId) {
      setError('Choose who has the card and which card to use.');
      return;
    }
    if (!merchant.trim()) {
      setError('Merchant is required.');
      return;
    }
    if (!address.trim()) {
      setError('Delivery address is required.');
      return;
    }
    if (parsed == null || parsed <= 100) {
      setError('Order amount must be a whole number greater than 100 PKR.');
      return;
    }
    const linkError = productUrlError(productUrl);
    if (linkError) {
      setError(linkError);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const created = await createRequest(sessionId, user.id, {
        card_holder_id: friendId,
        card_id: cardId,
        merchant: merchant.trim(),
        delivery_address: address.trim(),
        product_url: productUrl.trim() || null,
        order_amount: parsed,
        note: note.trim() || null,
      });
      showToast('Request sent');
      onNavigate('request-detail', { requestId: created.id }, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const friendOptions = labelledOptions(friends, (friend) => friend.display_name || friend.phone || friend.id, (friend) => friend.phone);
  const cardOptions = labelledOptions(cards, (card) => `${card.bank_name} · ${card.card_tier}`, (card) => String(card.id).slice(0, 4));

  return (
    <ScreenShell
      onRefresh={() => { setRefreshing(true); loadFriends(); }}
      refreshing={refreshing}
    >
      <TopBar title="Request order" onBack={onBack} />
      {loading ? (
        <LoadingState />
      ) : friends.length === 0 && !error ? (
        <View style={styles.pad}>
          <EmptyState message="Add someone to your circle first, and make sure they share a card." />
          <Pressable onPress={onOpenCircle}>
            <Text style={styles.link}>Go to Circle</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pad}>
          <Text style={styles.hint}>Pick a circle member who shares a card. The amount is the price without the card, delivery included. After proof, you pay the card charge plus 20% of the discount.</Text>
          <Dropdown
            label="Card holder"
            placeholder="Choose someone"
            options={friendOptions}
            value={friendId}
            onChange={onPickFriend}
          />
          <Dropdown
            label="Their card"
            placeholder={cards.length ? 'Choose a card' : 'No shared cards'}
            options={cardOptions}
            value={cardId}
            onChange={setCardId}
          />
          <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="e.g. Daraz" />
          <Field label="Delivery address" value={address} onChangeText={setAddress} placeholder="Full address" multiline />
          <Field label="Product URL (optional)" value={productUrl} onChangeText={setProductUrl} placeholder="https://" />
          <Field label="Price without the card (PKR)" value={amount} onChangeText={onChangeAmount} placeholder="e.g. 2500" keyboardType="number-pad" />
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything they should know" />
          <ErrorBanner message={error} onRetry={friends.length === 0 ? loadFriends : undefined} />
          <PrimaryButton label="Send request" loading={submitting} onPress={submit} />
        </View>
      )}
    </ScreenShell>
  );
}

function labelledOptions(items, labelFor, extraFor) {
  const labels = items.map(labelFor);
  const counts = labels.reduce((map, label) => {
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  return items.map((item, index) => {
    const base = labels[index];
    const label = counts[base] > 1 ? `${base} · ${extraFor(item)}` : base;
    return { id: item.id, label };
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
});
