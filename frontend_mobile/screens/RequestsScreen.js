import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getActiveOrders, getIncomingRequests } from '../api/holder';
import { getActiveRequests } from '../api/requester';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { asList, formatPkr } from '../utils/format';
import { REQUEST_STATUS_LABELS, requestStatusVariant } from '../utils/orderRules';

const FILTERS = [
  ['all', 'All'],
  ['asked', 'Requester'],
  ['holding', 'Card holder'],
];

export default function RequestsScreen({ activeTab, onTabPress, onNavigate, onMenu }) {
  const { sessionId, user } = useSession();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [sent, incoming, holding] = await Promise.allSettled([
      getActiveRequests(sessionId, user.id),
      getIncomingRequests(sessionId, user.id),
      getActiveOrders(sessionId, user.id),
    ]);
    const next = [];
    if (sent.status === 'fulfilled') {
      next.push(...asList(sent.value).map((item) => ({
        key: `asked-${item.id}`,
        role: 'asked',
        updatedAt: item.updated_at || item.created_at,
        title: item.merchant,
        subtitle: `You asked ${item.card_holder_name || 'them'} · ${formatPkr(item.order_amount)}`,
        badge: REQUEST_STATUS_LABELS[item.rq_status] || item.rq_status,
        badgeVariant: requestStatusVariant(item.rq_status),
        nav: { screen: 'request-detail', params: { requestId: item.id } },
      })));
    }
    if (incoming.status === 'fulfilled') {
      next.push(...asList(incoming.value).map((item) => ({
        key: `hold-${item.id}`,
        role: 'holding',
        updatedAt: item.updated_at || item.created_at,
        title: item.merchant,
        subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.order_amount)}`,
        badge: REQUEST_STATUS_LABELS.pending,
        badgeVariant: requestStatusVariant('pending'),
        nav: { screen: 'order-detail', params: { orderId: item.id } },
      })));
    }
    if (holding.status === 'fulfilled') {
      next.push(...asList(holding.value).map((item) => ({
        key: `hold-${item.id}`,
        role: 'holding',
        updatedAt: item.updated_at || item.created_at,
        title: item.merchant,
        subtitle: `${item.requester_name || 'Someone'} · ${formatPkr(item.order_amount)}`,
        badge: REQUEST_STATUS_LABELS[item.rq_status] || item.rq_status,
        badgeVariant: requestStatusVariant(item.rq_status),
        nav: { screen: 'order-detail', params: { orderId: item.id } },
      })));
    }
    next.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    const failed = [sent, incoming, holding].filter((result) => result.status === 'rejected');
    if (failed.length === 3) {
      setError(failed[0].reason?.message || 'Could not load requests.');
    } else {
      setItems(next);
      setError(failed.length ? 'Some requests could not be loaded.' : '');
    }
    setLoading(false);
    setRefreshing(false);
  }, [sessionId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = items.filter((item) => filter === 'all' || item.role === filter);

  return (
    <ScreenShell
      withNav
      activeTab={activeTab}
      onTabPress={onTabPress}
      onRefresh={() => { setRefreshing(true); load(); }}
      refreshing={refreshing}
    >
      <TopBar
        title="Requests"
        displayName={user.display_name}
        onAccount={onMenu}
        actionLabel="New"
        onAction={() => onNavigate('create-request')}
      />
      <View style={styles.filters}>
        {FILTERS.map(([id, label]) => {
          const selected = filter === id;
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <LoadingState />
      ) : visible.length === 0 && !error ? (
        <View style={styles.pad}>
          <EmptyState message="No live requests." />
        </View>
      ) : (
        visible.map((item) => (
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
        <ErrorBanner message={error} onRetry={() => { setRefreshing(true); load(); }} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  chip: {
    backgroundColor: theme.colors.bg3,
    borderRadius: theme.radius.pill,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipOn: {
    backgroundColor: theme.colors.greenDim,
    borderColor: theme.colors.green,
  },
  chipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  chipTextOn: {
    color: theme.colors.green,
  },
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
});
