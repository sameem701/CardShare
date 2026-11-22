import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { cancelRequest, chooseBroadcastHolder, getOrderGroup, replaceRequestProducts } from '../api/requester';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ProductRows from '../components/ProductRows';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList, formatPkr } from '../utils/format';
import { cleanProductRows, productsFromApi } from '../utils/products';

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'them';
}

export default function BroadcastStatusScreen() {
  const navigation = useNavigation();
  const groupId = useRoute().params?.groupId;
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);

  const query = useScreenQuery(
    ['broadcast', user?.id, groupId],
    ({ signal }) => getOrderGroup(sessionId, user.id, groupId, { signal }),
    Boolean(groupId)
  );
  const data = query.data || {};
  const members = asList(data.members);
  const products = asList(data.products);
  const pending = members.filter((row) => row.rq_status === 'pending');
  const ready = pending.filter((row) => row.holder_reply === 'available');
  const racing = pending.length > 1;
  const chosen = members.find((row) => row.rq_status === 'accepted' || row.rq_status === 'proof_submitted');
  const chosenId = chosen?.request_id || '';
  const leftoverId = !racing && pending.length === 1 ? pending[0].request_id : '';

  useEffect(() => {
    if (chosenId) {
      openScreen(navigation, 'order', { requestId: chosenId }, { replace: true });
      return;
    }
    if (leftoverId) {
      openScreen(navigation, 'order', { requestId: leftoverId }, { replace: true });
    }
  }, [chosenId, leftoverId, navigation]);

  const settle = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['inbox', user.id] }),
    queryClient.invalidateQueries({ queryKey: ['home', user.id] }),
    query.refetch(),
  ]);

  const saveProducts = async () => {
    const parsed = cleanProductRows(draft);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setWorking(true);
    setError('');
    try {
      await replaceRequestProducts(sessionId, user.id, groupId, parsed.products);
      showToast('Products updated');
      setEditing(false);
      await settle();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const choose = async (member) => {
    setWorking(true);
    setError('');
    try {
      const result = await chooseBroadcastHolder(sessionId, user.id, groupId, member.card_holder_id);
      showToast(`${firstName(member.display_name)} will place your order`);
      await settle();
      if (result?.request_id) {
        openScreen(navigation, 'order', { requestId: result.request_id }, { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
      setDialog(null);
    }
  };

  const closeRequest = async () => {
    const first = members[0];
    if (!first?.request_id) return;
    setWorking(true);
    try {
      await cancelRequest(sessionId, user.id, first.request_id);
      showToast('Request closed');
      await queryClient.invalidateQueries({ queryKey: ['inbox', user.id] });
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
      setDialog(null);
    }
  };

  if (query.showLoading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Request" onBack={() => navigation.goBack()} />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!members.length && !query.showLoading) {
    return (
      <ScreenShell>
        <TopBar title="Request" onBack={() => navigation.goBack()} />
        <View style={styles.pad}>
          <ErrorBanner message={error || query.errorMessage || 'No request yet. Start one from Home.'} onRetry={() => query.refetch()} />
        </View>
      </ScreenShell>
    );
  }

  const waitLine = members.length === 1
    ? `Waiting for ${firstName(members[0].display_name)}`
    : 'Waiting for others';

  return (
    <ScreenShell onRefresh={() => query.refetch()} refreshing={query.refreshing}>
      <TopBar title={data.merchant || 'Request'} onBack={() => navigation.goBack()} compactTitle />
      <View style={styles.hero}>
        <Text style={styles.heroLine}>
          {chosen
            ? `${chosen.display_name} is placing your order`
            : members.map((row) => row.bank_name).filter(Boolean).filter((name, i, all) => all.indexOf(name) === i).join(' · ')}
        </Text>
        <Text style={styles.amount}>
          <Text style={styles.cur}>PKR </Text>
          {Number(data.order_amount || 0).toLocaleString('en-US')}
        </Text>
        {chosen ? (
          <Text style={styles.sub}>On {firstName(chosen.display_name)}’s {chosen.bank_name} {chosen.card_tier}</Text>
        ) : null}
      </View>

      <View style={styles.pad}>
        <Text style={styles.label}>Products</Text>
        {editing ? (
          <>
            <ProductRows products={draft} onChange={setDraft} />
            <PrimaryButton label={working ? 'Please wait…' : 'Save products'} loading={working} onPress={saveProducts} />
            <Pressable onPress={() => setEditing(false)} style={styles.linkBtn}><Text style={styles.link}>Cancel</Text></Pressable>
          </>
        ) : (
          <>
            {products.length === 0 ? <Text style={styles.muted}>No products listed.</Text> : products.map((item) => (
              <View key={item.id} style={styles.productRead}>
                <Text style={styles.prodTitle}>
                  {item.title || item.product_url || 'Product'}
                  {Number(item.qty) > 1 ? `  ×${item.qty}` : ''}
                </Text>
                {item.note ? <Text style={styles.muted}>{item.note}</Text> : null}
              </View>
            ))}
            {racing || data.rq_status === 'accepted' ? (
              <Pressable
                onPress={() => {
                  setDraft(productsFromApi(products));
                  setEditing(true);
                }}
                style={styles.linkBtn}
              >
                <Text style={styles.link}>Edit products</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <ErrorBanner message={error || query.errorMessage} onRetry={() => query.refetch()} />

        {racing && !ready.length ? (
          <Text style={styles.wait}>{waitLine}.{'\n'}You’ll get a notification when someone is available.</Text>
        ) : null}

        {racing ? ready.map((member) => {
          const top = ready.reduce((max, row) => Math.max(max, Number(row.save_pkr) || 0), 0);
          const best = top > 0 && member.save_pkr === top;
          return (
            <View key={member.request_id} style={[styles.offer, best && styles.offerBest]}>
              <Text style={styles.who}>{member.display_name}</Text>
              {best ? <Text style={styles.flag}>Best match</Text> : null}
              <Text style={styles.card}>{member.bank_name} · {member.card_tier}</Text>
              {member.save_pkr ? (
                <Text style={styles.save}>You save <Text style={styles.saveVal}>{formatPkr(member.save_pkr)}</Text></Text>
              ) : null}
              <PrimaryButton
                label={`Choose ${firstName(member.display_name)}`}
                disabled={working}
                onPress={() => setDialog(member)}
              />
            </View>
          );
        }) : null}

        {racing ? (
          <Pressable onPress={() => setDialog('close')} style={styles.linkBtn}>
            <Text style={styles.danger}>Close request</Text>
          </Pressable>
        ) : null}
      </View>

      <ConfirmDialog
        visible={Boolean(dialog)}
        title={dialog === 'close' ? 'Close this request?' : `Choose ${firstName(dialog?.display_name)}?`}
        body={dialog === 'close'
          ? 'This request will stop for everyone you asked.'
          : `${data.merchant || 'This order'} will be ordered on ${firstName(dialog?.display_name)}’s ${dialog?.bank_name || ''} ${dialog?.card_tier || ''}.`}
        confirmLabel={dialog === 'close' ? 'Close request' : `Choose ${firstName(dialog?.display_name)}`}
        danger={dialog === 'close'}
        onCancel={() => setDialog(null)}
        onConfirm={() => (dialog === 'close' ? closeRequest() : choose(dialog))}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 40,
    gap: 10,
  },
  hero: {
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: 16,
  },
  heroLine: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  amount: {
    marginTop: 6,
    fontFamily: theme.fonts.display,
    fontSize: 34,
    color: theme.colors.text,
  },
  cur: {
    fontSize: 16,
  },
  sub: {
    marginTop: 4,
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  label: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  muted: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  wait: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 22,
    color: theme.colors.text2,
    textAlign: 'center',
    marginVertical: 16,
  },
  product: {
    gap: 8,
    marginBottom: 8,
  },
  productRead: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.control,
    padding: 12,
    gap: 4,
  },
  prodTitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
  offer: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  offerBest: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.greenDim2,
  },
  who: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 16,
    color: theme.colors.text,
  },
  flag: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.caption,
    color: theme.colors.green,
    textTransform: 'uppercase',
  },
  card: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  save: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  saveVal: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.text,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  link: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
  danger: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.red,
  },
});
