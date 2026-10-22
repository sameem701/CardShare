import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { openScreen } from '../navigation/openScreen';
import { loadHistory } from '../queries/history';
import { useScreenQuery } from '../queries/useScreenQuery';
import { formatDate, formatPkr } from '../utils/format';
import { txnStatusLabel, txnStatusVariant } from '../utils/orderRules';

export default function HistoryScreen() {
  const navigation = useNavigation();
  const { sessionId, user } = useSession();
  const history = useScreenQuery(
    ['history', user?.id],
    ({ signal, client }) => loadHistory(sessionId, user.id, { signal, client })
  );
  const asRequester = history.data?.asRequester || [];
  const asHolder = history.data?.asHolder || [];
  const error = history.isError ? history.errorMessage : (history.data?.error || '');
  const empty = !history.showLoading && asRequester.length === 0 && asHolder.length === 0;

  return (
    <ScreenShell
      onRefresh={() => history.refetch()}
      refreshing={history.refreshing}
    >
      <TopBar title="History" onBack={() => navigation.goBack()} />
      {history.showLoading ? (
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
                  onPress={() => openScreen(navigation, 'history-list', { role: 'requester' })}
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
                  onPress={() => openScreen(navigation, 'transaction-detail', { txnId: txn.id, role: 'requester' })}
                />
              ))}
            </>
          ) : null}
          {asHolder.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>Orders on your cards</Text>
                <Pressable
                  onPress={() => openScreen(navigation, 'history-list', { role: 'holder' })}
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
                  onPress={() => openScreen(navigation, 'transaction-detail', { txnId: txn.id, role: 'holder' })}
                />
              ))}
            </>
          ) : null}
        </>
      )}
      <View style={styles.pad}>
        <ErrorBanner message={error} onRetry={() => history.refetch()} />
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
