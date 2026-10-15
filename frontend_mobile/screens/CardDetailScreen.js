import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { deleteCard, getCards } from '../api/cards';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import SecondaryButton from '../components/SecondaryButton';
import ConfirmDialog from '../components/ConfirmDialog';
import TopBar from '../components/TopBar';
import VirtualCard from '../components/VirtualCard';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { asList } from '../utils/format';

export default function CardDetailScreen({ cardId, onBack }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await getCards(sessionId, user.id);
      const found = asList(rows).find((c) => c.id === cardId);
      setCard(found || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId, user.id, cardId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    setWorking(true);
    setError('');
    try {
      await deleteCard(sessionId, user.id, cardId);
      showToast('Card deleted');
      setConfirmDelete(false);
      onBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Card" onBack={onBack} />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!card) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Card" onBack={onBack} />
        <ErrorBanner message={error || 'Card not found.'} onRetry={load} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}>
      <TopBar title={`${card.bank_name}`} onBack={onBack} />
      <View style={styles.pad}>
      <VirtualCard
        bankName={card.bank_name}
        cardTier={card.card_tier}
        displayName={user.display_name}
      />
      <View style={styles.stack}>
        <SecondaryButton label="Delete card" danger disabled={working} onPress={() => setConfirmDelete(true)} />
      </View>
      <ErrorBanner message={error} onRetry={load} />
      </View>
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this card?"
        body="People in your circle will no longer see it."
        confirmLabel="Delete card"
        danger
        loading={working}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  stack: {
    gap: theme.spacing.sm,
  },
});
