import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteCard, getCards, toggleCardSharing } from '../api/cards';
import { getCircle } from '../api/circle';
import { getActiveOrders, getHolderHistory, getIncomingRequests } from '../api/holder';
import { getActiveRequests, getRequesterHistory } from '../api/requester';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import HomeStats from '../components/HomeStats';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import CardCarousel from '../components/CardCarousel';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { dashboardStats } from '../utils/dashboard';
import { asList, formatPkr, sharingOn } from '../utils/format';
import { REQUEST_STATUS_LABELS, TXN_STATUS_LABELS, requestStatusVariant, txnStatusVariant } from '../utils/orderRules';

function reasonMessage(result, fallback) {
  return result.reason?.message || fallback;
}

export default function HomeScreen({ activeTab, onTabPress, onNavigate }) {
  const { sessionId, user } = useSession();
  const [cards, setCards] = useState([]);
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const [recentError, setRecentError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [cardToRemove, setCardToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    const [cardRows, incomingRows, holderOrders, sentRows, holderHistory, requesterHistory, circleRows] = await Promise.allSettled([
      getCards(sessionId, user.id),
      getIncomingRequests(sessionId, user.id),
      getActiveOrders(sessionId, user.id),
      getActiveRequests(sessionId, user.id),
      getHolderHistory(sessionId, user.id),
      getRequesterHistory(sessionId, user.id),
      getCircle(sessionId, user.id),
    ]);

    if (cardRows.status === 'fulfilled') {
      setCards(asList(cardRows.value));
      setCardsError('');
    } else {
      setCardsError(reasonMessage(cardRows, 'Could not load cards.'));
    }

    const recentResults = [incomingRows, holderOrders, sentRows, holderHistory];
    const failed = recentResults.filter((result) => result.status === 'rejected');
    if (failed.length === recentResults.length) {
      setRecentError(reasonMessage(failed[0], 'Could not load recent orders.'));
    } else {
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
      if (holderHistory.status === 'fulfilled') {
        items.push(
          ...asList(holderHistory.value)
            .filter((item) => item.txn_status === 'unpaid')
            .map((item) => ({
              key: `unpaid-${item.id}`,
              updatedAt: item.updated_at || item.created_at,
              title: item.merchant,
              subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.actual_amount_paid)} still to receive`,
              badge: TXN_STATUS_LABELS.unpaid,
              badgeVariant: txnStatusVariant('unpaid'),
              nav: { screen: 'transaction-detail', params: { txnId: item.id, role: 'holder', snapshot: item } },
            }))
        );
      }
      items.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setRecent(items);
      setRecentError(failed.length ? 'Some recent orders could not be loaded.' : '');
    }

    const statsFailed = [holderHistory, requesterHistory, circleRows].filter((result) => result.status === 'rejected');
    setStats(dashboardStats({
      holderHistory: holderHistory.status === 'fulfilled' ? holderHistory.value : [],
      requesterHistory: requesterHistory.status === 'fulfilled' ? requesterHistory.value : [],
      circle: circleRows.status === 'fulfilled' ? circleRows.value : [],
    }));
    setStatsError(statsFailed.length ? 'Some totals could not be loaded.' : '');

    setLoading(false);
    setRefreshing(false);
  }, [sessionId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleSharing = async (card) => {
    const next = sharingOn(card.allow_sharing) ? 0 : 1;
    setCards((current) => current.map((item) => (
      item.id === card.id ? { ...item, allow_sharing: next } : item
    )));
    try {
      await toggleCardSharing(sessionId, user.id, card.id);
    } catch (err) {
      setCards((current) => current.map((item) => (
        item.id === card.id ? { ...item, allow_sharing: card.allow_sharing } : item
      )));
      setCardsError(err.message);
    }
  };

  const removeCard = async () => {
    if (!cardToRemove) return;
    setRemoving(true);
    setCardsError('');
    try {
      await deleteCard(sessionId, user.id, cardToRemove.id);
      setCards((current) => current.filter((item) => item.id !== cardToRemove.id));
      setCardToRemove(null);
    } catch (err) {
      setCardsError(err.message);
      setCardToRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ScreenShell withNav activeTab={activeTab} onTabPress={onTabPress} onRefresh={onRefresh} refreshing={refreshing}>
      <TopBar title="CardCircle" displayName={user.display_name} onProfile={() => onNavigate('profile')} />
      <HomeStats stats={stats} />
      <View style={styles.pad}>
        <ErrorBanner message={statsError} onRetry={onRefresh} />
      </View>
      <Text style={styles.section}>Your cards</Text>
      {cardsError ? (
        <View style={styles.pad}>
          <ErrorBanner message={cardsError} onRetry={onRefresh} />
        </View>
      ) : null}
      {loading ? (
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
        onPress={() => onNavigate('add-card')}
        accessibilityRole="button"
        accessibilityLabel="Add a card"
      >
        <Text style={styles.ghostText}>+ Add a card</Text>
      </Pressable>

      <Text style={styles.section}>Recent</Text>
      {!loading && !recentError && recent.length === 0 ? (
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
            onPress={() => onNavigate(item.nav.screen, item.nav.params)}
          />
        ))
      )}
      <View style={styles.pad}>
        <ErrorBanner message={recentError} onRetry={onRefresh} />
      </View>
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
});
