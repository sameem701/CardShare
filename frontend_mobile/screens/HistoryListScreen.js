import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
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
import { openScreen } from '../navigation/openScreen';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList, formatDate, formatPkr } from '../utils/format';
import { txnStatusLabel, txnStatusVariant } from '../utils/orderRules';

export default function HistoryListScreen() {
  const navigation = useNavigation();
  const { role } = useRoute().params;
  const { sessionId, user } = useSession();
  const holder = role === 'holder';
  const list = useScreenQuery(
    ['history-list', user?.id, role],
    async ({ signal }) => {
      const rows = holder
        ? await getHolderHistory(sessionId, user.id, { signal })
        : await getRequesterHistory(sessionId, user.id, { signal });
      return asList(rows);
    }
  );
  const items = list.data || [];
  const error = list.errorMessage;

  return (
    <ScreenShell onRefresh={() => list.refetch()} refreshing={list.refreshing}>
      <TopBar title={holder ? 'Orders on your cards' : 'Orders you requested'} onBack={() => navigation.goBack()} />
      {list.showLoading ? (
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
            onPress={() => openScreen(navigation, 'transaction-detail', { txnId: txn.id, role })}
          />
        ))
      )}
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ErrorBanner message={error} onRetry={() => list.refetch()} />
      </View>
    </ScreenShell>
  );
}
