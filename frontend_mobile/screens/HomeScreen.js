import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { deleteCard, getCards, toggleCardSharing } from '../api/cards';
import { getCircle } from '../api/circle';
import { getActiveOrders, getHolderHistory, getIncomingRequests, getUnpaidOrders } from '../api/holder';
import { getActiveRequests, getRequesterHistory, getUnpaidRequests } from '../api/requester';
import CircleStart from '../components/CircleStart';
import HomeNotice from '../components/HomeNotice';
import HomePanel from '../components/HomePanel';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import HomeStats from '../components/HomeStats';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import CardCarousel from '../components/CardCarousel';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useAppActions } from '../navigation/AppActions';
import { openCircle, openRequests, openScreen } from '../navigation/openScreen';
import { useScreenQuery } from '../queries/useScreenQuery';
import { queryClient } from '../queries/client';
import { dashboardStats } from '../utils/dashboard';
import { asList, formatPkr, sharingOn } from '../utils/format';
import { amountOwed } from '../utils/settlement';
import { REQUEST_STATUS_LABELS, TXN_STATUS_LABELS, requestStatusVariant, txnStatusVariant } from '../utils/orderRules';

function reasonMessage(result, fallback) {
  return result.reason?.message || fallback;
}

function inviteName(member) {
  return member.contact_name || member.display_name || 'Someone';
}

function homeNotice(invites, waiting, navigation) {
  if (invites.length === 1) {
    return {
      text: `${inviteName(invites[0])} invited you`,
      action: 'See invite',
      onPress: () => openCircle(navigation, { pending: true }),
    };
  }
  if (invites.length > 1) {
    return {
      text: 'You have invites',
      action: 'See invites',
      onPress: () => openCircle(navigation, { pending: true }),
    };
  }
  if (waiting.length === 1) {
    const item = waiting[0];
    const card = item.bank ? `your ${item.bank} card` : 'your card';
    return {
      text: `${item.name} asked to use ${card} · ${formatPkr(item.amount)}`,
      action: 'Review',
      onPress: () => openScreen(navigation, 'order-detail', { orderId: item.id }),
    };
  }
  if (waiting.length > 1) {
    return {
      text: `${waiting.length} requests are waiting`,
      action: 'Review',
      onPress: () => openRequests(navigation),
    };
  }
  return null;
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const { openMenu } = useAppActions();
  const { sessionId, user } = useSession();
  const [cardToRemove, setCardToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState('');

  const home = useScreenQuery(
    ['home', user?.id],
    async ({ signal, client }) => {
      const previous = client.getQueryData(['home', user.id]) || {};
      const [cardRows, incomingRows, holderOrders, sentRows, holderHistory, requesterHistory, unpaidHeld, unpaidAsked] = await Promise.allSettled([
        getCards(sessionId, user.id, { signal }),
        getIncomingRequests(sessionId, user.id, { signal }),
        getActiveOrders(sessionId, user.id, { signal }),
        getActiveRequests(sessionId, user.id, { signal }),
        getHolderHistory(sessionId, user.id, { signal }),
        getRequesterHistory(sessionId, user.id, { signal }),
        getUnpaidOrders(sessionId, user.id, { signal }),
        getUnpaidRequests(sessionId, user.id, { signal }),
      ]);
      if (signal?.aborted) {
        const aborted = new Error('Aborted');
        aborted.name = 'AbortError';
        throw aborted;
      }

      const cards = cardRows.status === 'fulfilled' ? asList(cardRows.value) : (previous.cards || []);
      const cardsError = cardRows.status === 'fulfilled' ? '' : reasonMessage(cardRows, 'Could not load cards.');

      const recentResults = [incomingRows, holderOrders, sentRows, unpaidHeld];
      const failed = recentResults.filter((result) => result.status === 'rejected');
      const items = [];
      if (incomingRows.status === 'fulfilled') {
        items.push(
          ...asList(incomingRows.value).map((item) => ({
            key: `in-${item.id}`,
            updatedAt: item.updated_at || item.created_at,
            title: item.merchant,
            subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.order_amount)}`,
            badge: REQUEST_STATUS_LABELS.pending,
            badgeVariant: requestStatusVariant('pending'),
            nav: { screen: 'order-detail', params: { orderId: item.id } },
          }))
        );
      }
      if (holderOrders.status === 'fulfilled') {
        items.push(
          ...asList(holderOrders.value).map((item) => ({
            key: `ho-${item.id}`,
            updatedAt: item.updated_at || item.created_at,
            title: item.merchant,
            subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.order_amount)}`,
            badge: REQUEST_STATUS_LABELS[item.rq_status] || item.rq_status,
            badgeVariant: requestStatusVariant(item.rq_status),
            nav: { screen: 'order-detail', params: { orderId: item.id } },
          }))
        );
      }
      if (sentRows.status === 'fulfilled') {
        items.push(
          ...asList(sentRows.value).map((item) => ({
            key: `out-${item.id}`,
            updatedAt: item.updated_at || item.created_at,
            title: item.merchant,
            subtitle: `You asked ${item.card_holder_name || 'them'} · ${formatPkr(item.order_amount)}`,
            badge: REQUEST_STATUS_LABELS[item.rq_status] || item.rq_status,
            badgeVariant: requestStatusVariant(item.rq_status),
            nav: { screen: 'request-detail', params: { requestId: item.id } },
          }))
        );
      }
      if (unpaidHeld.status === 'fulfilled') {
        items.push(
          ...asList(unpaidHeld.value).map((item) => ({
            key: `unpaid-${item.id}`,
            updatedAt: item.updated_at || item.created_at,
            title: item.merchant,
            subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(amountOwed(item))} still to receive`,
            badge: TXN_STATUS_LABELS.unpaid,
            badgeVariant: txnStatusVariant('unpaid'),
            nav: { screen: 'transaction-detail', params: { txnId: item.id, role: 'holder' } },
          }))
        );
      }
      items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      const recent = failed.length === recentResults.length ? (previous.recent || []) : items;
      const recentError = failed.length
        ? (failed.length === recentResults.length
          ? reasonMessage(failed[0], 'Could not load recent orders.')
          : 'Some recent orders could not be loaded.')
        : '';

      const waiting = incomingRows.status === 'fulfilled'
        ? asList(incomingRows.value).map((item) => ({
          id: item.id,
          name: item.requester_name || 'Someone',
          bank: item.bank_name || '',
          amount: item.order_amount,
        }))
        : (previous.waiting || []);

      const sentCount = sentRows.status === 'fulfilled' ? asList(sentRows.value).length : null;
      const askedCount = requesterHistory.status === 'fulfilled' ? asList(requesterHistory.value).length : null;
      const unpaidAskedCount = unpaidAsked.status === 'fulfilled' ? asList(unpaidAsked.value).length : null;
      const hasSentOrder = (sentCount || 0) + (askedCount || 0) + (unpaidAskedCount || 0) > 0
        || (unpaidAskedCount == null && Boolean(previous.hasSentOrder));

      const statsFailed = [holderHistory, requesterHistory].filter((result) => result.status === 'rejected');
      const stats = statsFailed.length && previous.stats
        ? previous.stats
        : dashboardStats({
          holderHistory: holderHistory.status === 'fulfilled' ? holderHistory.value : [],
          requesterHistory: requesterHistory.status === 'fulfilled' ? requesterHistory.value : [],
        });

      return {
        cards,
        cardsError,
        recent,
        recentError,
        stats,
        statsError: statsFailed.length ? 'Some totals could not be loaded.' : '',
        hasSentOrder,
        waiting,
      };
    }
  );

  const circle = useScreenQuery(
    ['circle', user?.id],
    async ({ signal }) => asList(await getCircle(sessionId, user.id, { signal }))
  );
  const members = circle.data || [];
  const inCircle = members.some((member) => member.c_status === 'accepted');
  const showWelcome = Boolean(circle.data) && !inCircle;

  const cards = home.data?.cards || [];
  const recent = home.data?.recent || [];
  const stats = home.data?.stats || null;
  const showStats = (stats?.holderOrders || 0) + (stats?.requesterOrders || 0) > 0;
  const showHomeOrder = Boolean(home.data) && !showStats;
  const hasSentOrder = Boolean(home.data?.hasSentOrder);
  const waiting = home.data?.waiting || [];
  const receivedInvites = members.filter((member) => member.c_status === 'pending' && !member.is_sender);
  const notice = homeNotice(receivedInvites, waiting, navigation);
  const cardsError = actionError || home.data?.cardsError || '';
  const recentError = home.data?.recentError || '';
  const statsError = home.data?.statsError || '';

  const onRefresh = () => {
    home.refetch();
    circle.refetch();
  };

  const toggleSharing = async (card) => {
    const next = sharingOn(card.allow_sharing) ? 0 : 1;
    const patch = (allowSharing) => {
      queryClient.setQueryData(['home', user.id], (current) => {
        if (!current) return current;
        return {
          ...current,
          cards: (current.cards || []).map((item) => (
            item.id === card.id ? { ...item, allow_sharing: allowSharing } : item
          )),
        };
      });
    };
    patch(next);
    setActionError('');
    try {
      await toggleCardSharing(sessionId, user.id, card.id);
    } catch (err) {
      patch(card.allow_sharing);
      setActionError(err.message);
    }
  };

  const removeCard = async () => {
    if (!cardToRemove) return;
    setRemoving(true);
    setActionError('');
    try {
      await deleteCard(sessionId, user.id, cardToRemove.id);
      queryClient.setQueryData(['home', user.id], (current) => {
        if (!current) return current;
        return {
          ...current,
          cards: (current.cards || []).filter((item) => item.id !== cardToRemove.id),
        };
      });
      setCardToRemove(null);
    } catch (err) {
      setActionError(err.message);
      setCardToRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ScreenShell onRefresh={onRefresh} refreshing={home.refreshing || circle.refreshing}>
      <TopBar title="Home" displayName={user.display_name} onAccount={openMenu} />
      {circle.showLoading ? (
        <LoadingState />
      ) : showWelcome ? (
        <>
        <CircleStart
          members={members}
          onAdd={() => openScreen(navigation, 'add-circle')}
          onOpenCircle={() => openCircle(navigation, { pending: true })}
        />
        <Text style={styles.section}>Your cards</Text>
        {cardsError ? (
          <View style={styles.pad}>
            <ErrorBanner message={cardsError} onRetry={onRefresh} />
          </View>
        ) : null}
        {home.showLoading ? (
          <LoadingState />
        ) : cards.length > 0 ? (
          <CardCarousel
            cards={cards}
            displayName={user.display_name}
            earnedByCard={stats?.earnedByCard || {}}
            onToggleSharing={toggleSharing}
            onRemove={setCardToRemove}
          />
        ) : null}
        <Pressable
          style={styles.ghost}
          onPress={() => openScreen(navigation, 'add-card')}
          accessibilityRole="button"
          accessibilityLabel="Add a card"
        >
          <Text style={styles.ghostText}>+ Add a card</Text>
        </Pressable>
        </>
      ) : (
      <>
      {circle.isError && !circle.data ? (
        <View style={styles.pad}>
          <ErrorBanner message={circle.errorMessage || 'Could not load your circle.'} onRetry={onRefresh} />
        </View>
      ) : null}
      {notice ? <HomeNotice text={notice.text} action={notice.action} onPress={notice.onPress} /> : null}
      {showStats ? <HomeStats stats={stats} /> : null}
      <View style={styles.pad}>
        <ErrorBanner message={statsError} onRetry={onRefresh} />
      </View>
      {showHomeOrder && !hasSentOrder ? (
        <HomePanel
          title="Start your first order."
          body="Pick a card from your circle. They place the order. You get the discount and pay them back."
          button="Start first order"
          onPress={() => openScreen(navigation, 'create-request')}
        />
      ) : null}
      {showHomeOrder && hasSentOrder ? (
        <View style={styles.orderAction}>
          <PrimaryButton
            label="Request order"
            onPress={() => openScreen(navigation, 'create-request')}
          />
        </View>
      ) : null}
      <Text style={styles.section}>Your cards</Text>
      {cardsError ? (
        <View style={styles.pad}>
          <ErrorBanner message={cardsError} onRetry={onRefresh} />
        </View>
      ) : null}
      {home.showLoading ? (
        <LoadingState />
      ) : cards.length === 0 ? (
        <View style={styles.pad}>
          <EmptyState message="No cards yet." />
        </View>
      ) : (
        <CardCarousel
          cards={cards}
          displayName={user.display_name}
          earnedByCard={stats?.earnedByCard || {}}
          onToggleSharing={toggleSharing}
          onRemove={setCardToRemove}
        />
      )}
      <Pressable
        style={styles.ghost}
        onPress={() => openScreen(navigation, 'add-card')}
        accessibilityRole="button"
        accessibilityLabel="Add a card"
      >
        <Text style={styles.ghostText}>+ Add a card</Text>
      </Pressable>

      <Text style={styles.section}>Recent</Text>
      {!home.showLoading && !recentError && recent.length === 0 ? (
        <View style={styles.pad}>
          <EmptyState message="No orders need attention." />
        </View>
      ) : (
        recent.map((item) => (
          <ListCard
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            badgeLabel={item.badge}
            badgeVariant={item.badgeVariant}
            onPress={() => openScreen(navigation, item.nav.screen, item.nav.params)}
          />
        ))
      )}
      <View style={styles.pad}>
        <ErrorBanner message={recentError} onRetry={onRefresh} />
      </View>
      </>
      )}
      <ConfirmDialog
        visible={Boolean(cardToRemove)}
        title="Remove this card?"
        body="It leaves your list. Past orders keep the bank and tier. A card with a live order cannot be removed."
        confirmLabel="Remove card"
        danger
        loading={removing}
        onCancel={() => setCardToRemove(null)}
        onConfirm={removeCard}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.section,
    paddingHorizontal: theme.layout.screenPadding,
  },
  ghost: {
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.bg3,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    borderRadius: theme.radius.control,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  ghostText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
  orderAction: {
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
  },
});
