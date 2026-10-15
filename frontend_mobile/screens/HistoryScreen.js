import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getHolderHistory } from '../api/holder';
import { getRequesterHistory } from '../api/requester';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { asList, formatDate, formatPkr } from '../utils/format';
import { txnStatusLabel, txnStatusVariant } from '../utils/orderRules';

export default function HistoryScreen({ activeTab, onTabPress, onNavigate }) {
  const { sessionId, user } = useSession();
  const [asRequester, setAsRequester] = useState([]);
  const [asHolder, setAsHolder] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [req, hold] = await Promise.allSettled([
      getRequesterHistory(sessionId, user.id),
      getHolderHistory(sessionId, user.id),
    ]);
    if (req.status === 'fulfilled') setAsRequester(asList(req.value));
    if (hold.status === 'fulfilled') setAsHolder(asList(hold.value));
    const failed = [req, hold].filter((result) => result.status === 'rejected');
    setError(failed.length ? failed[0].reason?.message || 'Could not load history.' : '');
    setLoading(false);
    setRefreshing(false);
  }, [sessionId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const empty = !loading && asRequester.length === 0 && asHolder.length === 0;

  return (
    <ScreenShell
      withNav
      activeTab={activeTab}
      onTabPress={onTabPress}
      onRefresh={() => { setRefreshing(true); load(); }}
      refreshing={refreshing}
    >
      <TopBar title="History" />
      {loading ? (
        <LoadingState />
      ) : empty && !error ? (
        <View style={styles.pad}>
          <EmptyState message="No orders yet." />
        </View>
      ) : (
        <>
          {asRequester.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>Orders you requested</Text>
                <Pressable
                  onPress={() => onNavigate('history-list', { role: 'requester' })}
                  accessibilityRole="button"
                  accessibilityLabel="See all orders you requested"
                >
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              </View>
              {asRequester.slice(0, 3).map((txn) => (
                <ListCard
                  key={`r-${txn.id}`}
                  title={txn.merchant}
                  subtitle={`${txn.card_holder_name || 'Card holder'} · ${formatPkr(txn.order_amount)} · ${formatDate(txn.created_at)}`}
                  badgeLabel={txnStatusLabel(txn.txn_status, 'requester')}
                  badgeVariant={txnStatusVariant(txn.txn_status)}
                  onPress={() => onNavigate('transaction-detail', { txnId: txn.id, role: 'requester', snapshot: txn })}
                />
              ))}
            </>
          ) : null}
          {asHolder.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>Orders on your cards</Text>
                <Pressable
                  onPress={() => onNavigate('history-list', { role: 'holder' })}
                  accessibilityRole="button"
                  accessibilityLabel="See all orders on your cards"
                >
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              </View>
              {asHolder.slice(0, 3).map((txn) => (
                <ListCard
                  key={`h-${txn.id}`}
                  title={txn.merchant}
                  subtitle={`${txn.requester_name || 'Someone'} · ${formatPkr(txn.order_amount)} · ${formatDate(txn.created_at)}`}
                  badgeLabel={txnStatusLabel(txn.txn_status, 'holder')}
                  badgeVariant={txnStatusVariant(txn.txn_status)}
                  onPress={() => onNavigate('transaction-detail', { txnId: txn.id, role: 'holder', snapshot: txn })}
                />
              ))}
            </>
          ) : null}
        </>
      )}
      <View style={styles.pad}>
        <ErrorBanner message={error} onRetry={() => { setRefreshing(true); load(); }} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: theme.layout.screenPadding,
  },
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
  seeAll: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
});
