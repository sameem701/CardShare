import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextField from '../components/TextField';
import * as ImagePicker from 'expo-image-picker';
import {
  acceptOrder,
  cancelOrder,
  declineOrder,
  getOrder,
  getScreenshotUploadUrl,
  submitProof,
} from '../api/holder';
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
import { formatDate, formatPkr } from '../utils/format';
import {
  REQUEST_STATUS_LABELS,
  requestStatusVariant,
  canChatSendOnRequest,
  holderCanAcceptDecline,
  holderCanCancel,
  holderCanSubmitProof,
} from '../utils/orderRules';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { prepareImage, uploadBlobToSignedUrl } from '../utils/upload';

export default function OrderDetailHolderScreen({ orderId, onBack, onNavigate }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [pickedAsset, setPickedAsset] = useState(null);
  usePrefetchChat(orderId, Boolean(data) && canChatSendOnRequest(data?.rq_status));

  const load = useCallback(async () => {
    setError('');
    try {
      const row = await getOrder(sessionId, user.id, orderId);
      setData(row);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, user.id, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async () => {
    setWorking(true);
    setError('');
    try {
      await acceptOrder(sessionId, user.id, orderId);
      showToast('Order accepted');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const decline = async () => {
    setWorking(true);
    setError('');
    try {
      await declineOrder(sessionId, user.id, orderId);
      showToast('Request declined');
      setConfirmDecline(false);
      onBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const doCancel = async (reason) => {
    setWorking(true);
    setCancelError('');
    try {
      await cancelOrder(sessionId, user.id, orderId, reason);
      setCancelOpen(false);
      showToast('Order cancelled');
      onBack();
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPickedAsset(result.assets[0]);
    }
  };

  const onChangePaid = (value) => {
    const next = wholePkrFromInput(value);
    setPaidAmount(next.amount);
    if (next.rejectedDecimal) setError('Enter a whole number of PKR, without paisa.');
    else setError('');
  };

  const sendProof = async () => {
    const amount = parseWholePkr(paidAmount);
    if (!pickedAsset) {
      setError('Choose a screenshot of the receipt.');
      return;
    }
    if (amount == null || amount <= 0) {
      setError('Enter the actual amount paid (whole PKR).');
      return;
    }
    if (data?.order_amount != null && amount > Number(data.order_amount)) {
      setError('Amount paid cannot be more than the order amount.');
      return;
    }

    setWorking(true);
    setError('');
    try {
      const prepared = await prepareImage(pickedAsset);
      const slot = await getScreenshotUploadUrl(sessionId, user.id, orderId, prepared.ext);
      await uploadBlobToSignedUrl(slot.signed_url, prepared.blob, prepared.mime);
      await submitProof(sessionId, user.id, orderId, slot.path, amount);
      showToast('Proof sent');
      setPickedAsset(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Order" onBack={onBack} />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!data) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Order" onBack={onBack} />
        <ErrorBanner message={error || 'Order not found.'} onRetry={load} />
      </ScreenShell>
    );
  }

  const screenshot = data.screenshot_signed_url || data.screenshot_url;

  return (
    <ScreenShell onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}>
      <TopBar title={data.merchant} onBack={onBack} />
      <View style={styles.pad}>
      <Badge
        label={REQUEST_STATUS_LABELS[data.rq_status] || data.rq_status}
        variant={requestStatusVariant(data.rq_status)}
      />
      <DetailCard>
        <DetailRow label="From" value={data.requester_name} />
        <DetailRow label="Card" value={`${data.bank_name} · ${data.card_tier}`} />
        <DetailRow
          label="Address"
          value={data.delivery_address || 'Shown after you accept'}
        />
        {data.product_url ? <DetailRow label="Product" value={data.product_url} /> : null}
        {data.note ? <DetailRow label="Note" value={data.note} /> : null}
      </DetailCard>
      <DetailCard>
        <DetailRow label="Order amount" value={formatPkr(data.order_amount)} />
        {data.actual_amount_paid != null ? (
          <DetailRow label="You paid" value={formatPkr(data.actual_amount_paid)} />
        ) : null}
      </DetailCard>
      {screenshot ? (
        <View style={styles.proof}>
          <Text style={styles.proofLabel}>Submitted proof</Text>
          <ProofImage uri={screenshot} style={styles.image} onReload={load} />
        </View>
      ) : null}
      <Text style={styles.meta}>Updated {formatDate(data.updated_at)}</Text>

      {holderCanAcceptDecline(data.rq_status) ? (
        <View style={styles.stack}>
          <PrimaryButton label="Accept" loading={working} onPress={accept} />
          <SecondaryButton label="Decline" disabled={working} onPress={() => setConfirmDecline(true)} />
        </View>
      ) : null}

      {canChatSendOnRequest(data.rq_status) ? (
        <PrimaryButton label="Open chat" onPress={() => onNavigate('chat', { threadId: orderId, canSend: true })} />
      ) : null}

      {holderCanSubmitProof(data.rq_status) ? (
        <View style={styles.stack}>
          <Text style={styles.section}>Submit proof</Text>
          <SecondaryButton label={pickedAsset ? 'Screenshot selected' : 'Choose screenshot'} onPress={pickImage} disabled={working} />
          <TextField
            value={paidAmount}
            onChangeText={onChangePaid}
            placeholder="Actual amount paid (PKR)"
            keyboardType="number-pad"
          />
          <PrimaryButton label="Submit proof" loading={working} onPress={sendProof} />
        </View>
      ) : null}

      {holderCanCancel(data.rq_status) ? (
        <SecondaryButton label="Cancel order" danger disabled={working} onPress={() => setCancelOpen(true)} />
      ) : null}

      <ErrorBanner message={error} onRetry={load} />
      </View>

      <ConfirmDialog
        visible={confirmDecline}
        title="Decline this request?"
        body="The request will be removed. No order is recorded."
        confirmLabel="Decline"
        danger
        loading={working}
        onCancel={() => setConfirmDecline(false)}
        onConfirm={decline}
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
  stack: { gap: theme.spacing.sm },
  section: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
