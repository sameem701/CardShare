import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { getOrder, getScreenshotUploadUrl, submitProof } from '../api/holder';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TextField from '../components/TextField';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { useBottomInset } from '../hooks/useTopInset';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { formatPkr } from '../utils/format';
import { parseWholePkr, wholePkrFromInput } from '../utils/money';
import { amountOwed, recordedShare } from '../utils/settlement';
import { prepareImage, uploadBlobToSignedUrl } from '../utils/upload';

export default function SendProofScreen() {
  const navigation = useNavigation();
  const { orderId } = useRoute().params;
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const bottomInset = useBottomInset();
  const order = useScreenQuery(
    ['order', user?.id, orderId],
    ({ signal }) => getOrder(sessionId, user.id, orderId, { signal })
  );
  const data = order.data;
  const [original, setOriginal] = useState('');
  const [paid, setPaid] = useState('');
  const [asset, setAsset] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!data || ready) return;
    setOriginal(data.order_amount == null ? '' : String(data.order_amount));
    setReady(true);
  }, [data, ready]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setAsset(result.assets[0]);
      setError('');
    }
  };

  const change = (setter) => (value) => {
    const next = wholePkrFromInput(value);
    setter(next.amount);
    setError(next.rejectedDecimal ? 'Enter a whole number of PKR, without paisa.' : '');
  };

  const typedOriginal = parseWholePkr(original);
  const typedPaid = parseWholePkr(paid);
  const valid = typedOriginal != null && typedPaid != null && typedOriginal > 100 && typedPaid > 0 && typedPaid <= typedOriginal;
  const preview = valid ? { order_amount: typedOriginal, actual_amount_paid: typedPaid } : null;
  const receive = amountOwed(preview);

  const send = async () => {
    if (!asset) return setError('Choose a screenshot of the receipt.');
    if (typedOriginal == null || typedOriginal <= 100) {
      return setError('Price without the card must be a whole number greater than 100 PKR.');
    }
    if (typedPaid == null || typedPaid <= 0) return setError('Enter the amount paid on the card (whole PKR).');
    if (typedPaid > typedOriginal) return setError('Amount paid cannot be more than the price without the card.');

    setWorking(true);
    setError('');
    try {
      const prepared = await prepareImage(asset);
      const slot = await getScreenshotUploadUrl(sessionId, user.id, orderId, prepared.ext);
      await uploadBlobToSignedUrl(slot.signed_url, prepared.blob, prepared.mime);
      await submitProof(sessionId, user.id, orderId, slot.path, typedOriginal, typedPaid);
      showToast('Proof sent');
      await queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['order', user.id, orderId] });
      // Back past the order screen to wherever the person came from.
      if (navigation.canGoBack()) navigation.goBack();
      if (navigation.canGoBack()) navigation.goBack();
    } catch (err) {
      setError(err.message);
      setWorking(false);
    }
  };

  const back = () => navigation.goBack();

  if (order.showLoading || !data) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Send proof" onBack={back} />
        {order.showLoading ? <LoadingState /> : (
          <View style={styles.pad}>
            <ErrorBanner message={order.errorMessage || 'Order not found.'} onRetry={() => order.refetch()} />
          </View>
        )}
      </ScreenShell>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenShell>
        <TopBar title="Send proof" onBack={back} />
        <View style={styles.pad}>
          <Pressable
            onPress={pick}
            disabled={working}
            style={[styles.picker, asset && styles.pickerDone]}
            accessibilityRole="button"
            accessibilityLabel="Receipt screenshot"
          >
            <Text style={[styles.pickerTitle, asset && styles.pickerTitleDone]}>
              {asset ? 'Screenshot selected' : 'Add receipt screenshot'}
            </Text>
            <Text style={styles.pickerHint}>{asset ? 'Tap to change it' : 'Show the amount you paid'}</Text>
          </Pressable>

          <Text style={styles.label}>Original Price (Total)</Text>
          <TextField
            value={original}
            onChangeText={change(setOriginal)}
            placeholder="Original Price (Total)"
            keyboardType="number-pad"
          />
          <Text style={styles.label}>Discounted Price (Total)</Text>
          <TextField
            value={paid}
            onChangeText={change(setPaid)}
            placeholder="Amount the card was charged"
            keyboardType="number-pad"
          />

          <Text style={styles.live}>
            {receive != null ? (
              <>You&apos;ll receive <Text style={styles.liveStrong}>{formatPkr(receive)}</Text></>
            ) : (
              'Enter the amount paid on the card.'
            )}
          </Text>
          {receive != null ? <Text style={styles.liveSub}>Includes your {formatPkr(recordedShare(preview))} incentive</Text> : null}
          <ErrorBanner message={error} />
        </View>
      </ScreenShell>
      <View style={[styles.bar, { paddingBottom: Math.max(24, bottomInset) }]}>
        <PrimaryButton label="Send proof" loading={working} onPress={send} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  pad: { paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.sm },
  picker: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border2,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  pickerDone: { borderStyle: 'solid', borderColor: theme.colors.green, backgroundColor: theme.colors.greenDim },
  pickerTitle: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.text },
  pickerTitleDone: { color: theme.colors.green },
  pickerHint: { marginTop: 4, fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.text3 },
  label: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text2,
  },
  live: {
    marginTop: theme.spacing.md,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.text2,
  },
  liveStrong: { fontFamily: theme.fonts.bodyMedium, color: theme.colors.green },
  liveSub: { fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.text3 },
  bar: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: 12,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
});
