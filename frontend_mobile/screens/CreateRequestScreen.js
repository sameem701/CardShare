import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import { openCircle, openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList } from '../utils/format';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { productUrlError } from '../utils/productUrl';

export default function CreateRequestScreen() {
  const navigation = useNavigation();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [friendId, setFriendId] = useState('');
  const [cardId, setCardId] = useState('');
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
  const cardsQuery = useScreenQuery(
    ['circle-cards', user?.id, friendId],
    async ({ signal }) => asList(await getCircleCards(sessionId, user.id, friendId, { signal })),
    Boolean(friendId)
  );
  const friends = (friendsQuery.data || []).filter((member) => member.c_status === 'accepted');
  const cards = friendId ? (cardsQuery.data || []) : [];
  const error = actionError || friendsQuery.errorMessage || cardsQuery.errorMessage;

  const onChangeAmount = (value) => {
    const next = wholePkrFromInput(value);
    setAmount(next.amount);
    if (next.rejectedDecimal) setActionError('Enter a whole number of PKR, without paisa.');
    else setActionError('');
  };

  const onPickFriend = (id) => {
    setFriendId(id);
    setCardId('');
  };

  const submit = async () => {
    const parsed = parseWholePkr(amount);
    if (!friendId || !cardId) {
      setActionError('Choose who has the card and which card to use.');
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
      await queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
      openScreen(navigation, 'request-detail', { requestId: created.id }, { replace: true });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const friendOptions = labelledOptions(friends, (friend) => friend.display_name || friend.phone || friend.id, (friend) => friend.phone);
  const cardOptions = labelledOptions(cards, (card) => `${card.bank_name} · ${card.card_tier}`, (card) => String(card.id).slice(0, 4));

  return (
    <ScreenShell
      onRefresh={() => friendsQuery.refetch()}
      refreshing={friendsQuery.refreshing}
    >
      <TopBar title="Request order" onBack={() => navigation.goBack()} />
      {friendsQuery.showLoading ? (
        <LoadingState />
      ) : friends.length === 0 && !error ? (
        <View style={styles.pad}>
          <EmptyState message="Add someone to your circle first, and make sure they share a card." />
          <Pressable onPress={() => openCircle(navigation)}>
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
          <ErrorBanner message={error} onRetry={friends.length === 0 ? () => friendsQuery.refetch() : undefined} />
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
