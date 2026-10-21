import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
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
import { queryClient } from '../queries/client';
import { useScreenQuery } from '../queries/useScreenQuery';
import { asList } from '../utils/format';

export default function CardDetailScreen() {
  const navigation = useNavigation();
  const { cardId } = useRoute().params;
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState('');
  const cardQuery = useScreenQuery(
    ['card', user?.id, cardId],
    async ({ signal }) => {
      const rows = await getCards(sessionId, user.id, { signal });
      return asList(rows).find((item) => item.id === cardId) || null;
    }
  );
  const card = cardQuery.data;
  const error = actionError || cardQuery.errorMessage;

  const remove = async () => {
    setWorking(true);
    setActionError('');
    try {
      await deleteCard(sessionId, user.id, cardId);
      showToast('Card deleted');
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ['home', user.id] });
      navigation.goBack();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (cardQuery.showLoading) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Card" onBack={() => navigation.goBack()} />
        <LoadingState />
      </ScreenShell>
    );
  }

  if (!card) {
    return (
      <ScreenShell scroll={false}>
        <TopBar title="Card" onBack={() => navigation.goBack()} />
        <ErrorBanner message={error || 'Card not found.'} onRetry={() => cardQuery.refetch()} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell onRefresh={() => cardQuery.refetch()} refreshing={cardQuery.refreshing}>
      <TopBar title={`${card.bank_name}`} onBack={() => navigation.goBack()} />
      <View style={styles.pad}>
      <VirtualCard
        bankName={card.bank_name}
        cardTier={card.card_tier}
        displayName={user.display_name}
      />
      <View style={styles.stack}>
        <SecondaryButton label="Delete card" danger disabled={working} onPress={() => setConfirmDelete(true)} />
      </View>
      <ErrorBanner message={error} onRetry={() => cardQuery.refetch()} />
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
