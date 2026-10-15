import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ALLOWED_BANKS, ALLOWED_CARD_TIERS, addCard } from '../api/cards';
import Dropdown from '../components/Dropdown';
import ErrorBanner from '../components/ErrorBanner';
import PrimaryButton from '../components/PrimaryButton';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';

export default function AddCardScreen({ onBack, onSaved }) {
  const { sessionId, user } = useSession();
  const showToast = useToast();
  const [bank, setBank] = useState('');
  const [tier, setTier] = useState('');
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
      await addCard(sessionId, user.id, bank, tier);
      showToast('Card added');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title="Add a card" onBack={onBack} />
      <View style={styles.scroll}>
        <Text style={styles.subtitle}>Bank and tier only. The card number stays with you.</Text>
        <Dropdown label="Bank" placeholder="Choose a bank" options={ALLOWED_BANKS} value={bank} onChange={setBank} />
        <Dropdown label="Tier" placeholder="Choose a tier" options={ALLOWED_CARD_TIERS} value={tier} onChange={setTier} />
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
});
