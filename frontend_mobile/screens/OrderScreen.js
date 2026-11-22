import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  acceptOrder,
  cancelOrder,
  confirmPaid,
  declineOrder,
  getHolderTransaction,
  getOrder,
  markAvailable,
} from '../api/holder';
import {
  acceptProof,
  cancelRequest,
  getRequest,
  getRequesterTransaction,
  rejectProof,
  replaceRequestProducts,
} from '../api/requester';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import { ChatIcon } from '../components/NavIcons';
import PrimaryButton from '../components/PrimaryButton';
import ProductRows from '../components/ProductRows';
import ProofImage from '../components/ProofImage';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { usePrefetchChat } from '../context/ChatCache';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { useBottomInset } from '../hooks/useTopInset';
import { openScreen } from '../navigation/openScreen';
import { queryClient } from '../queries/client';
import { useOrderUnread } from '../queries/inbox';
import { useScreenQuery } from '../queries/useScreenQuery';
import { formatPkr } from '../utils/format';
import { cleanProductRows, productsFromApi } from '../utils/products';
import {
  STEP_LABELS,
  buildOrder,
  orderFacts,
  orderHero,
  orderOfferRows,
  orderProductFacts,
  orderReceipt,
  stepsFilled,
} from '../utils/orderView';

// One screen for every order: a live request, a live order or a closed
// transaction, for the person asking and the person holding the card.

function FactIcon({ name }) {
  const color = theme.colors.text2;
  const common = { stroke: color, strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      {name === 'person' ? (
        <>
          <Circle cx="12" cy="8" r="4" {...common} />
          <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" {...common} />
        </>
      ) : null}
      {name === 'pin' ? (
        <>
          <Path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" {...common} />
          <Circle cx="12" cy="9.5" r="2.5" {...common} />
        </>
      ) : null}
      {name === 'lock' ? (
        <>
          <Rect x="5" y="11" width="14" height="9" rx="2.5" {...common} />
          <Path d="M8 11V8a4 4 0 018 0v3" {...common} />
        </>
      ) : null}
      {name === 'link' ? (
        <>
          <Path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" {...common} />
          <Path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1" {...common} />
        </>
      ) : null}
      {name === 'info' ? (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 11v5M12 8h.01" {...common} />
        </>
      ) : null}
      {name === 'bag' ? (
        <>
          <Path d="M6 8h12l-1 12H7L6 8z" {...common} />
          <Path d="M9 8V7a3 3 0 016 0v1" {...common} />
        </>
      ) : null}
    </Svg>
  );
}

function Steps({ filled }) {
  return (
    <View style={styles.steps}>
      {STEP_LABELS.map((label, index) => {
        const done = index < filled;
        return (
          <View key={label} style={styles.step}>
            {index > 0 ? <View style={[styles.stepLine, done && styles.stepLineDone]} /> : null}
            <View style={[styles.dotRing, done && styles.dotRingDone]}>
              <View style={[styles.dot, done && styles.dotDone]} />
            </View>
            <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function openUrl(url) {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  Linking.openURL(target).catch(() => {});
}

export default function OrderScreen() {
  const navigation = useNavigation();
  const params = useRoute().params || {};
  const { requestId, orderId, txnId, role } = params;
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const bottomInset = useBottomInset();
  const uid = user?.id;

  const request = useScreenQuery(
    ['request', uid, requestId],
    ({ signal }) => getRequest(sessionId, uid, requestId, { signal })
  );
  const order = useScreenQuery(
    ['order', uid, orderId],
    ({ signal }) => getOrder(sessionId, uid, orderId, { signal })
  );
  const txn = useScreenQuery(
    ['transaction', uid, role, txnId],
    async ({ signal }) => {
      const row = role === 'holder'
        ? await getHolderTransaction(sessionId, uid, txnId, { signal })
        : await getRequesterTransaction(sessionId, uid, txnId, { signal });
      return row || null;
    }
  );

  const source = requestId ? 'request' : orderId ? 'order' : 'txn';
  const query = source === 'request' ? request : source === 'order' ? order : txn;
  const threadId = requestId || orderId || txnId;
  const o = buildOrder(source, query.data, role);
  const storedUnread = useOrderUnread(threadId);
  const broadcastGroupId = source === 'request' && o?.role === 'asked' && o.state === 'pending' && o.groupSize > 1
    ? o.orderGroupId
    : '';

  useEffect(() => {
    if (!broadcastGroupId) return;
    openScreen(navigation, 'broadcast', { groupId: broadcastGroupId }, { replace: true });
  }, [broadcastGroupId, navigation]);

  usePrefetchChat(threadId, Boolean(o) && (o.state === 'accepted' || o.state === 'proof' || !o.live));

  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(null);
  const [editingProducts, setEditingProducts] = useState(false);
  const [productDraft, setProductDraft] = useState([]);

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inbox', uid] });
    return query.refetch();
  };

  const settle = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['inbox', uid] }),
    queryClient.invalidateQueries({ queryKey: ['history', uid] }),
    queryClient.invalidateQueries({ queryKey: ['history-list', uid] }),
    queryClient.invalidateQueries({ queryKey: ['home', uid] }),
    queryClient.invalidateQueries({ queryKey: ['user-stats', uid] }),
    queryClient.invalidateQueries({ queryKey: ['card-stats', uid] }),
  ]);

  const run = async (action, toast, { stay = false } = {}) => {
    setWorking(true);
    setError('');
    setDialogError('');
    try {
      await action();
      showToast(toast);
      setDialog(null);
      await settle();
      if (stay) await query.refetch();
      else navigation.goBack();
    } catch (err) {
      if (dialog) setDialogError(err.message);
      else setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (query.showLoading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Order" onBack={() => navigation.goBack()} compactTitle />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!o) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Order" onBack={() => navigation.goBack()} compactTitle />
        <View style={styles.pad}>
          <ErrorBanner message={error || query.errorMessage || 'Order not found.'} onRetry={reload} />
        </View>
      </ScreenShell>
    );
  }

  const hero = orderHero(o);
  const productFacts = orderProductFacts(o);
  const hideProducts = o.state === 'proof';
  const facts = hideProducts ? orderFacts(o) : [...orderFacts(o), ...productFacts];
  const receipt = orderReceipt(o);
  const offerRows = orderOfferRows(o);
  const hasDetails = Boolean(receipt) || offerRows.length > 0 || (hideProducts && productFacts.length > 0);
  const receiptOpen = detailsOpen == null ? (o.state === 'paid' || o.state === 'proof') : detailsOpen;
  const canEditProducts = o.role === 'asked' && o.live && (o.state === 'pending' || o.state === 'accepted') && o.orderGroupId;

  const saveProducts = async () => {
    const parsed = cleanProductRows(productDraft);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setWorking(true);
    setError('');
    try {
      await replaceRequestProducts(sessionId, uid, o.orderGroupId, parsed.products);
      showToast('Products updated');
      setEditingProducts(false);
      await settle();
      await query.refetch();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };
  const filled = stepsFilled(o.state);
  const showProof = Boolean(o.screenshot) && (o.state === 'proof' || o.state === 'unpaid' || o.state === 'paid');
  const unread = storedUnread ?? o.unread;

  const chatShown = !(o.live && o.state === 'pending');
  const chatLive = o.live && (o.state === 'accepted' || o.state === 'proof');
  const openChat = () => openScreen(navigation, 'chat', { threadId, canSend: chatLive });

  const asked = o.role === 'asked';
  const name = o.first;

  const cancelDialog = {
    title: asked ? 'Cancel this request?' : 'Cancel this order?',
    body: o.state === 'accepted'
      ? `Tell ${name} why you are cancelling.`
      : 'Nothing is recorded. You can send a new request later.',
    confirmLabel: asked ? 'Cancel request' : 'Cancel order',
    needReason: o.state === 'accepted',
    danger: true,
    cancelLabel: 'Go back',
    run: (reason) => run(
      () => (asked
        ? cancelRequest(sessionId, uid, requestId, o.state === 'accepted' ? reason : undefined)
        : cancelOrder(sessionId, uid, orderId, reason)),
      asked ? 'Request cancelled' : 'Order cancelled'
    ),
  };

  const dialogs = {
    cancel: cancelDialog,
    reject: {
      title: 'Reject this proof?',
      body: `The order goes back to accepted so ${name} can send proof again.`,
      confirmLabel: 'Reject proof',
      danger: true,
      run: () => run(() => rejectProof(sessionId, uid, requestId), 'Proof rejected'),
    },
    decline: {
      title: o.groupSize > 1 ? 'Can’t take this?' : 'Decline this request?',
      body: o.groupSize > 1
        ? `${name} will not see you as available for this order.`
        : `${name} will not see your card for this order.`,
      confirmLabel: o.groupSize > 1 ? 'Can’t' : 'Decline',
      danger: true,
      run: () => run(() => declineOrder(sessionId, uid, orderId), o.groupSize > 1 ? 'Marked as can’t' : 'Request declined'),
    },
    received: {
      title: 'Money received?',
      body: 'This marks the order paid. It cannot be undone.',
      confirmLabel: 'Money received',
      run: () => run(() => confirmPaid(sessionId, uid, txnId), 'Marked as paid'),
    },
  };
  const current = dialog ? dialogs[dialog] : null;

  const wait = (text) => <Text style={styles.wait}>{text}</Text>;
  const link = (label, key, danger = true) => (
    <Pressable
      onPress={() => { setDialogError(''); setDialog(key); }}
      disabled={working}
      accessibilityRole="button"
      style={styles.linkBtn}
    >
      <Text style={[styles.linkText, !danger && styles.linkTextPlain]}>{label}</Text>
    </Pressable>
  );

  let actions = null;
  if (o.live || o.state === 'unpaid') {
    if (asked && o.state === 'pending') {
      actions = <>{wait(`Waiting for ${name}`)}{link('Cancel request', 'cancel')}</>;
    } else if (asked && o.state === 'accepted') {
      actions = link('Cancel request', 'cancel');
    } else if (asked && o.state === 'proof') {
      actions = (
        <>
          <PrimaryButton
            label="Accept proof"
            loading={working}
            onPress={() => run(() => acceptProof(sessionId, uid, requestId), 'Proof accepted')}
          />
          {link('Reject proof', 'reject')}
        </>
      );
    } else if (!asked && o.state === 'pending') {
      const racing = o.groupSize > 1;
      if (racing && o.holderReply === 'available') {
        actions = <>{wait(`You’re available. Waiting for ${name} to choose.`)}{link('Can’t', 'decline')}</>;
      } else if (racing) {
        actions = (
          <>
            <PrimaryButton
              label="Available"
              loading={working}
              onPress={() => run(() => markAvailable(sessionId, uid, orderId), 'You’re available', { stay: true })}
            />
            {link('Can’t', 'decline')}
          </>
        );
      } else {
        actions = (
          <>
            <PrimaryButton
              label="Accept"
              loading={working}
              onPress={() => run(() => acceptOrder(sessionId, uid, orderId), 'Order accepted', { stay: true })}
            />
            {link('Decline', 'decline')}
          </>
        );
      }
    } else if (!asked && o.state === 'accepted') {
      actions = (
        <>
          <PrimaryButton
            label="Send proof"
            disabled={working}
            onPress={() => openScreen(navigation, 'send-proof', { orderId })}
          />
          {link('Cancel order', 'cancel')}
        </>
      );
    } else if (!asked && o.state === 'proof') {
      actions = wait(`Waiting for ${name} to check your proof`);
    } else if (!asked && o.state === 'unpaid') {
      actions = (
        <PrimaryButton label="Mark received" loading={working} onPress={() => { setDialogError(''); setDialog('received'); }} />
      );
    }
  }

  return (
    <View style={styles.root}>
      <ScreenShell onRefresh={reload} refreshing={query.refreshing}>
        <TopBar
          title={o.store}
          onBack={() => navigation.goBack()}
          compactTitle
          right={chatShown ? (
            <Pressable
              onPress={openChat}
              style={styles.chatBtn}
              accessibilityRole="button"
              accessibilityLabel={chatLive ? 'Open chat' : 'View chat history'}
            >
              <ChatIcon color={theme.colors.text} />
              {unread > 0 ? <View style={styles.chatDot} /> : null}
            </Pressable>
          ) : null}
        />

        {o.state !== 'cancelled' ? <Steps filled={filled} /> : <View />}

        <View style={styles.hero}>
          <Text style={[styles.heroLine, hero.bad && styles.heroBad]}>{hero.line}</Text>
          {hero.amount != null ? (
            <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              <Text style={styles.heroCurrency}>PKR </Text>
              {Number(hero.amount).toLocaleString('en-PK')}
            </Text>
          ) : null}
          {hero.sub ? <Text style={[styles.heroSub, hero.reason && styles.heroReason]}>{hero.sub}</Text> : null}
        </View>

        {showProof ? (
          <View style={styles.proofWrap}>
            <ProofImage uri={o.screenshot} style={styles.proof} onReload={reload} />
          </View>
        ) : null}

        {hasDetails && hideProducts ? (
          <>
            <Pressable
              onPress={() => setDetailsOpen(!receiptOpen)}
              style={styles.toggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: receiptOpen }}
            >
              <Text style={styles.toggleText}>Details</Text>
              <Text style={styles.toggleChevron}>{receiptOpen ? '\u2303' : '\u2304'}</Text>
            </Pressable>
            {receiptOpen ? (
              <View style={styles.receipt}>
                {offerRows.map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{row.label}</Text>
                    <Text style={styles.receiptValue}>{row.value}</Text>
                  </View>
                ))}
                {receipt ? receipt.rows.map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{row.label}</Text>
                    <Text
                      style={[
                        styles.receiptValue,
                        row.tone === 'dim' && styles.receiptDim,
                        row.tone === 'earn' && styles.receiptEarn,
                      ]}
                    >
                      {row.value}
                    </Text>
                  </View>
                )) : null}
                {receipt ? (
                  <View style={[styles.receiptRow, styles.receiptTotal]}>
                    <Text style={styles.totalLabel}>{receipt.totalLabel}</Text>
                    <Text style={styles.totalValue}>{receipt.total}</Text>
                  </View>
                ) : null}
                {productFacts.map((fact, index) => (
                  <Pressable
                    key={`p-${index}`}
                    onPress={fact.url ? () => openUrl(fact.url) : undefined}
                    style={styles.receiptRow}
                  >
                    <Text style={styles.receiptLabel}>{fact.text}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.facts}>
          {facts.map((fact, index) => {
            const row = (
              <View style={[styles.fact, index > 0 && styles.factBorder]}>
                <View style={styles.factIcon}><FactIcon name={fact.icon} /></View>
                <Text
                  style={[
                    styles.factText,
                    fact.kind === 'link' && styles.factLink,
                    fact.kind === 'note' && styles.factNote,
                    fact.kind === 'locked' && styles.factLocked,
                  ]}
                >
                  {fact.text}
                </Text>
              </View>
            );
            return fact.kind === 'link' ? (
              <Pressable key={`${fact.icon}-${index}`} onPress={() => openUrl(fact.url)} accessibilityRole="link">
                {row}
              </Pressable>
            ) : (
              <View key={`${fact.icon}-${index}`}>{row}</View>
            );
          })}
        </View>

        {canEditProducts ? (
          <View style={styles.pad}>
            {editingProducts ? (
              <>
                <ProductRows products={productDraft} onChange={setProductDraft} />
                <PrimaryButton label={working ? 'Please wait…' : 'Save products'} loading={working} onPress={saveProducts} />
                <Pressable onPress={() => setEditingProducts(false)} style={styles.linkBtn}>
                  <Text style={[styles.linkText, styles.linkTextPlain]}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setProductDraft(productsFromApi(o.products, o.url));
                  setEditingProducts(true);
                }}
                style={styles.linkBtn}
              >
                <Text style={[styles.linkText, styles.linkTextPlain]}>Edit products</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {hasDetails && !hideProducts ? (
          <>
            <Pressable
              onPress={() => setDetailsOpen(!receiptOpen)}
              style={styles.toggle}
              accessibilityRole="button"
              accessibilityState={{ expanded: receiptOpen }}
            >
              <Text style={styles.toggleText}>Details</Text>
              <Text style={styles.toggleChevron}>{receiptOpen ? '\u2303' : '\u2304'}</Text>
            </Pressable>
            {receiptOpen ? (
              <View style={styles.receipt}>
                {offerRows.map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{row.label}</Text>
                    <Text style={styles.receiptValue}>{row.value}</Text>
                  </View>
                ))}
                {receipt ? receipt.rows.map((row) => (
                  <View key={row.label} style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>{row.label}</Text>
                    <Text
                      style={[
                        styles.receiptValue,
                        row.tone === 'dim' && styles.receiptDim,
                        row.tone === 'earn' && styles.receiptEarn,
                      ]}
                    >
                      {row.value}
                    </Text>
                  </View>
                )) : null}
                {receipt ? (
                  <View style={[styles.receiptRow, styles.receiptTotal]}>
                    <Text style={styles.totalLabel}>{receipt.totalLabel}</Text>
                    <Text style={styles.totalValue}>{receipt.total}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.pad}>
          <ErrorBanner message={error || (query.isError ? query.errorMessage : '')} onRetry={reload} />
        </View>
      </ScreenShell>

      {actions ? (
        <View style={[styles.actions, { paddingBottom: Math.max(24, bottomInset) }]}>{actions}</View>
      ) : null}

      <ConfirmDialog
        visible={Boolean(current)}
        title={current?.title || ''}
        body={current?.body}
        confirmLabel={current?.confirmLabel}
        cancelLabel={current?.cancelLabel}
        danger={current?.danger}
        needReason={current?.needReason}
        error={dialogError}
        loading={working}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => current?.run(reason)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  pad: { paddingHorizontal: theme.layout.screenPadding },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.green,
    borderWidth: 1.5,
    borderColor: theme.colors.bg,
  },
  steps: {
    flexDirection: 'row',
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: 4,
    paddingBottom: 14,
  },
  step: { flex: 1, alignItems: 'center' },
  stepLine: {
    position: 'absolute',
    top: 9,
    left: '-50%',
    width: '100%',
    height: 2,
    backgroundColor: theme.colors.border,
  },
  stepLineDone: { backgroundColor: theme.colors.green },
  dotRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRingDone: { backgroundColor: theme.colors.greenDim },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.bg3,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  dotDone: { backgroundColor: theme.colors.green, borderColor: theme.colors.green },
  stepLabel: {
    marginTop: 6,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 11,
    color: theme.colors.text3,
  },
  stepLabelDone: { color: theme.colors.text },
  hero: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 18,
  },
  heroLine: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text2,
  },
  heroBad: { color: theme.colors.red, fontSize: 18 },
  heroAmount: {
    marginTop: 4,
    fontFamily: theme.fonts.display,
    fontSize: 42,
    lineHeight: 50,
    color: theme.colors.text,
    letterSpacing: -1,
  },
  heroCurrency: {
    fontSize: 16,
    color: theme.colors.green,
    letterSpacing: 0,
  },
  heroSub: {
    marginTop: 4,
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.text3,
  },
  heroReason: { fontSize: 14, lineHeight: 20, color: theme.colors.text2, marginTop: 8 },
  proofWrap: {
    marginHorizontal: theme.layout.screenPadding,
    marginBottom: 14,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg2,
    overflow: 'hidden',
  },
  proof: { width: '100%', height: 200 },
  facts: {
    marginHorizontal: theme.layout.screenPadding,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  factBorder: { borderTopWidth: 0.5, borderTopColor: theme.colors.border },
  factIcon: { width: 20, alignItems: 'center', paddingTop: 1 },
  factText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  factLink: { color: theme.colors.blue },
  factNote: { fontStyle: 'italic', color: theme.colors.text2 },
  factLocked: { color: theme.colors.text3 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: theme.layout.screenPadding,
    paddingVertical: 16,
  },
  toggleText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text2,
  },
  toggleChevron: { fontSize: 16, color: theme.colors.text3 },
  receipt: {
    marginHorizontal: theme.layout.screenPadding,
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
  },
  receiptLabel: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.text2 },
  receiptValue: { fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.text },
  receiptDim: { color: theme.colors.text3, textDecorationLine: 'line-through' },
  receiptEarn: { color: theme.colors.green },
  receiptTotal: {
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
    marginTop: 4,
    paddingVertical: 12,
  },
  totalLabel: { fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.text },
  totalValue: { fontFamily: theme.fonts.display, fontSize: 17, color: theme.colors.text },
  actions: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: 12,
    gap: 4,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  wait: {
    textAlign: 'center',
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.text2,
    paddingVertical: 6,
  },
  linkBtn: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.red },
  linkTextPlain: { color: theme.colors.text2 },
});
