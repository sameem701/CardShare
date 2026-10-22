import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ALLOWED_BANKS, ALLOWED_CARD_TIERS, addCard, getCards, toggleCardSharing } from '../api/cards';
import Dropdown from '../components/Dropdown';
import ErrorBanner from '../components/ErrorBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import SharingSwitch from '../components/SharingSwitch';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { queryClient } from '../queries/client';
import { asList, sharingOn } from '../utils/format';

export default function AddCardScreen() {
  const navigation = useNavigation();
  const goBack = () => navigation.goBack();
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [bank, setBank] = useState('');
  const [tier, setTier] = useState('');
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!bank) {
      setError('Choose a bank.');
      return;
    }
    if (!tier) {
      setError('Choose a tier.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const before = asList(await getCards(sessionId, user.id));
      const beforeIds = new Set(before.map((card) => card.id));
      await addCard(sessionId, user.id, bank, tier);
      if (sharing) {
        const after = asList(await getCards(sessionId, user.id));
        const created = after.find((card) => !beforeIds.has(card.id));
        if (!created) throw new Error('Card was added, but sharing could not be turned on.');
        if (!sharingOn(created.allow_sharing)) {
          await toggleCardSharing(sessionId, user.id, created.id);
        }
      }
      showToast('Card added');
      await queryClient.invalidateQueries({ queryKey: ['home', user.id] });
      goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title="Add a card" onBack={goBack} />
      <View style={styles.scroll}>
        <Text style={styles.subtitle}>Bank and tier only. The card number stays with you.</Text>
        <Dropdown label="Bank" placeholder="Choose a bank" options={ALLOWED_BANKS} value={bank} onChange={setBank} />
        <Dropdown label="Tier" placeholder="Choose a tier" options={ALLOWED_CARD_TIERS} value={tier} onChange={setTier} />
        <Pressable
          style={styles.shareRow}
          onPress={() => setSharing((current) => !current)}
          accessibilityRole="switch"
          accessibilityState={{ checked: sharing }}
          accessibilityLabel={sharing ? 'Sharing on' : 'Sharing off'}
        >
          <Text style={styles.shareLabel}>Sharing</Text>
          <SharingSwitch on={sharing} />
        </Pressable>
        <Text style={styles.shareHint}>
          {sharing
            ? 'Your circle can see this card and ask you to order on it.'
            : 'Your circle cannot see this card.'}
        </Text>
        <ErrorBanner message={error} />
        <PrimaryButton label="Save card" loading={saving} onPress={submit} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  shareLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  shareHint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 18,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
  },
});
