import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
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

export default function HistoryListScreen({ role, onBack, onNavigate }) {
  const { sessionId, user } = useSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const holder = role === 'holder';

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = holder
        ? await getHolderHistory(sessionId, user.id)
        : await getRequesterHistory(sessionId, user.id);
      setItems(asList(rows));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [holder, sessionId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenShell onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}>
      <TopBar title={holder ? 'Orders on your cards' : 'Orders you requested'} onBack={onBack} />
      {loading ? (
        <LoadingState />
      ) : items.length === 0 && !error ? (
        <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
          <EmptyState message="No orders yet." />
        </View>
      ) : (
        items.map((txn) => (
          <ListCard
            key={txn.id}
            title={txn.merchant}
            subtitle={holder
              ? `${txn.requester_name || 'Someone'} · ${formatPkr(txn.order_amount)} · ${formatDate(txn.created_at)}`
              : `${txn.card_holder_name || 'Card holder'} · ${formatPkr(txn.order_amount)} · ${formatDate(txn.created_at)}`}
            badgeLabel={txnStatusLabel(txn.txn_status, role)}
            badgeVariant={txnStatusVariant(txn.txn_status)}
            onPress={() => onNavigate('transaction-detail', { txnId: txn.id, role, snapshot: txn })}
          />
        ))
      )}
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ErrorBanner message={error} onRetry={load} />
      </View>
    </ScreenShell>
  );
}
