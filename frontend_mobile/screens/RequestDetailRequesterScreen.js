import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  acceptProof,
  cancelRequest,
  getRequest,
  rejectProof,
} from '../api/requester';
import Badge from '../components/Badge';
import { DetailCard, DetailRow } from '../components/DetailCard';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import ConfirmDialog from '../components/ConfirmDialog';
import PrimaryButton from '../components/PrimaryButton';
import ProofImage from '../components/ProofImage';
import ReasonModal from '../components/ReasonModal';
import ScreenShell from '../components/ScreenShell';
import SecondaryButton from '../components/SecondaryButton';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { usePrefetchChat } from '../context/ChatCache';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useOrderUnread } from '../queries/inbox';
import { useScreenQuery } from '../queries/useScreenQuery';
import { formatDate, formatPkr } from '../utils/format';
import { amountKept, amountOwed, recordedShare } from '../utils/settlement';
import {
  REQUEST_STATUS_LABELS,
  requestStatusVariant,
  canChatSendOnRequest,
  requesterCanCancel,
  requesterCanReviewProof,
  requesterCancelNeedsReason,
} from '../utils/orderRules';

export default function RequestDetailRequesterScreen() {
  const navigation = useNavigation();
  const { requestId } = useRoute().params;
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const request = useScreenQuery(
    ['request', user?.id, requestId],
    ({ signal }) => getRequest(sessionId, user.id, requestId, { signal })
  );
  const data = request.data;
  const storedUnread = useOrderUnread(requestId);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  usePrefetchChat(requestId, Boolean(data) && canChatSendOnRequest(data?.rq_status));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const banner = error || (request.isError ? request.errorMessage : '');

  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
    return request.refetch();
  };

  const doCancel = async (reason) => {
    setWorking(true);
    setCancelError('');
    try {
      await cancelRequest(sessionId, user.id, requestId, reason || undefined);
      await queryClient.invalidateQueries({ queryKey: ['history', user.id] });
      setCancelOpen(false);
      setConfirmCancel(false);
      showToast('Request cancelled');
      navigation.goBack();
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const doAcceptProof = async () => {
    setWorking(true);
    setError('');
    try {
      const result = await acceptProof(sessionId, user.id, requestId);
      showToast('Proof accepted');
      openScreen(navigation, 'transaction-detail', { txnId: result.txn_id, role: 'requester' }, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const doRejectProof = async () => {
    setWorking(true);
    setError('');
    try {
      await rejectProof(sessionId, user.id, requestId);
      setConfirmReject(false);
      showToast('Proof rejected');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (request.showLoading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Request" onBack={() => navigation.goBack()} />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!data) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Request" onBack={() => navigation.goBack()} />
        <ErrorBanner message={banner || 'Request not found.'} onRetry={load} />
      </ScreenShell>
    );
  }

  const share = recordedShare(data);
  const owed = amountOwed(data);
  const kept = amountKept(data);
  const screenshot = data.screenshot_signed_url || data.screenshot_url;

  return (
    <ScreenShell onRefresh={load} refreshing={request.refreshing}>
      <TopBar title={data.merchant} onBack={() => navigation.goBack()} />
      <View style={styles.pad}>
        <Badge
          label={REQUEST_STATUS_LABELS[data.rq_status] || data.rq_status}
          variant={requestStatusVariant(data.rq_status)}
        />
        <DetailCard>
          <DetailRow label="Card holder" value={data.card_holder_name} />
          <DetailRow label="Card" value={`${data.bank_name} · ${data.card_tier}`} />
          <DetailRow label="Address" value={data.delivery_address} />
          {data.product_url ? <DetailRow label="Product" value={data.product_url} link /> : null}
          {data.note ? <DetailRow label="Note" value={data.note} /> : null}
        </DetailCard>
        <DetailCard>
          <DetailRow label="Price without the card" value={formatPkr(data.order_amount)} />
          {data.actual_amount_paid != null ? (
            <DetailRow label="Paid on card" value={formatPkr(data.actual_amount_paid)} />
          ) : null}
          {data.actual_amount_paid != null && share != null ? (
            <DetailRow label="Their share" value={formatPkr(share)} />
          ) : null}
          {owed != null ? <DetailRow label="You pay" value={formatPkr(owed)} highlight /> : null}
          {kept != null ? <DetailRow label="You keep" value={formatPkr(kept)} /> : null}
        </DetailCard>
        {screenshot ? (
          <View style={styles.proof}>
            <Text style={styles.proofLabel}>Proof screenshot</Text>
            <ProofImage uri={screenshot} style={styles.image} onReload={load} />
          </View>
        ) : null}
        <Text style={styles.meta}>Updated {formatDate(data.updated_at)}</Text>

        {canChatSendOnRequest(data.rq_status) ? (
          <PrimaryButton
            label="Open chat"
            count={storedUnread ?? data.unread_count}
            onPress={() => openScreen(navigation, 'chat', { threadId: requestId, canSend: true })}
          />
        ) : null}

        {requesterCanReviewProof(data.rq_status) ? (
          <View style={styles.stack}>
            <PrimaryButton label="Accept proof" loading={working} onPress={doAcceptProof} />
            <SecondaryButton label="Reject proof" disabled={working} onPress={() => setConfirmReject(true)} />
          </View>
        ) : null}

        {requesterCanCancel(data.rq_status) ? (
          <SecondaryButton
            label="Cancel request"
            danger
            disabled={working}
            onPress={() => {
              if (requesterCancelNeedsReason(data.rq_status)) setCancelOpen(true);
              else setConfirmCancel(true);
            }}
          />
        ) : null}

        <ErrorBanner message={banner} onRetry={load} />
      </View>

      <ConfirmDialog
        visible={confirmReject}
        title="Reject this proof?"
        body="The order goes back to accepted so they can send proof again."
        confirmLabel="Reject proof"
        danger
        loading={working}
        onCancel={() => setConfirmReject(false)}
        onConfirm={doRejectProof}
      />
      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel this request?"
        body="Nothing is recorded. You can send a new request later."
        confirmLabel="Cancel request"
        danger
        loading={working}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => doCancel('')}
      />
      <ReasonModal
        visible={cancelOpen}
        title="Why are you cancelling?"
        onCancel={() => setCancelOpen(false)}
        onSubmit={(reason) => {
          if (!reason) {
            setCancelError('A reason is required.');
            return;
          }
          doCancel(reason);
        }}
        loading={working}
        error={cancelError}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  proof: {
    gap: theme.spacing.sm,
  },
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
  stack: {
    gap: theme.spacing.sm,
  },
});
