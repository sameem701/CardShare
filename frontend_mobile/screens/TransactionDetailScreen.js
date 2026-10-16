import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { confirmPaid, getHolderHistory } from '../api/holder';
import { getRequesterHistory } from '../api/requester';
import LoadingState from '../components/LoadingState';
import Badge from '../components/Badge';
import { DetailCard, DetailRow } from '../components/DetailCard';
import ErrorBanner from '../components/ErrorBanner';
import ConfirmDialog from '../components/ConfirmDialog';
import PrimaryButton from '../components/PrimaryButton';
import ProofImage from '../components/ProofImage';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { usePrefetchChat } from '../context/ChatCache';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { formatDate, formatPkr } from '../utils/format';
import { amountKept, amountOwed, recordedShare } from '../utils/settlement';
import { holderCanConfirmPaid, txnStatusLabel, txnStatusVariant } from '../utils/orderRules';

export default function TransactionDetailScreen({ txnId, role, snapshot, onBack, onNavigate }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [data, setData] = useState(snapshot || null);
  const [loading, setLoading] = useState(!snapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);
  usePrefetchChat(txnId, Boolean(data));

  const load = useCallback(async () => {
    setError('');
    try {
      const rows =
        role === 'holder'
          ? await getHolderHistory(sessionId, user.id)
          : await getRequesterHistory(sessionId, user.id);
      const found = (Array.isArray(rows) ? rows : []).find((t) => t.id === txnId);
      setData(found || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, user.id, txnId, role]);

  useEffect(() => {
    if (snapshot) {
      setData(snapshot);
      setLoading(false);
      return;
    }
    load();
  }, [snapshot, load]);

  const confirm = async () => {
    setWorking(true);
    setError('');
    try {
      await confirmPaid(sessionId, user.id, txnId);
      showToast('Marked as paid');
      setConfirmPaidOpen(false);
      setData((current) => (current ? { ...current, txn_status: 'paid' } : current));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Transaction" onBack={onBack} />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!data) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Transaction" onBack={onBack} />
        <ErrorBanner message={error || 'Transaction details are unavailable.'} onRetry={load} />
      </ScreenShell>
    );
  }

  const share = recordedShare(data);
  const owed = amountOwed(data);
  const kept = amountKept(data);
  const screenshot = data.screenshot_signed_url || data.screenshot_url;
  const showAddress = role === 'requester' && data.delivery_address;

  return (
    <ScreenShell onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}>
      <TopBar title={data.merchant} onBack={onBack} />
      <View style={styles.pad}>
      <Badge
        label={txnStatusLabel(data.txn_status, role)}
        variant={txnStatusVariant(data.txn_status)}
      />
      <DetailCard>
        <DetailRow label="Card" value={`${data.bank_name} · ${data.card_tier}`} />
        {showAddress ? <DetailRow label="Address" value={data.delivery_address} /> : null}
        {data.cancel_reason ? <DetailRow label="Reason" value={data.cancel_reason} /> : null}
      </DetailCard>
      <DetailCard>
        <DetailRow label="Price without the card" value={formatPkr(data.order_amount)} />
        {data.actual_amount_paid != null ? (
          <DetailRow label="Paid on card" value={formatPkr(data.actual_amount_paid)} />
        ) : null}
        {data.actual_amount_paid != null && share != null ? (
          <DetailRow label={role === 'holder' ? 'Your share' : 'Their share'} value={formatPkr(share)} />
        ) : null}
        {owed != null ? (
          <DetailRow label={role === 'holder' ? 'You receive' : 'You pay'} value={formatPkr(owed)} highlight />
        ) : null}
        {role === 'requester' && kept != null ? (
          <DetailRow label="You keep" value={formatPkr(kept)} />
        ) : null}
      </DetailCard>
      {screenshot ? (
        <View style={styles.proof}>
          <Text style={styles.proofLabel}>Screenshot</Text>
          <ProofImage uri={screenshot} style={styles.image} onReload={load} />
        </View>
      ) : null}
      <Text style={styles.meta}>{formatDate(data.created_at)}</Text>

      <PrimaryButton
        label="View chat history"
        onPress={() => onNavigate('chat', { threadId: txnId, canSend: false })}
      />

      {role === 'holder' && holderCanConfirmPaid(data.txn_status) ? (
        <PrimaryButton label="Money received" loading={working} onPress={() => setConfirmPaidOpen(true)} />
      ) : null}

      {role === 'requester' && data.txn_status === 'unpaid' && owed != null ? (
        <Text style={styles.hint}>Pay them {formatPkr(owed)} outside the app.</Text>
      ) : null}

      <ErrorBanner message={error} onRetry={load} />
      <ConfirmDialog
        visible={confirmPaidOpen}
        title="Money received?"
        body="This marks the order paid. It cannot be undone."
        confirmLabel="Money received"
        loading={working}
        onCancel={() => setConfirmPaidOpen(false)}
        onConfirm={confirm}
      />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  proof: { gap: theme.spacing.sm },
  proofLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg3,
  },
  meta: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
  },
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    lineHeight: 22,
  },
});
