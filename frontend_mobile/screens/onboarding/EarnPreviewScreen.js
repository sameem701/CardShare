import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getBanks, getTiers } from '../../api/cards';
import { listCardEarnPreview } from '../../api/stores';
import CardPager from '../../components/CardPager';
import Dropdown from '../../components/Dropdown';
import ErrorBanner from '../../components/ErrorBanner';
import LoadingState from '../../components/LoadingState';
import PrimaryButton from '../../components/PrimaryButton';
import VirtualCard from '../../components/VirtualCard';
import theme from '../../constants/theme';
import { useSession } from '../../context/SessionContext';
import { useTopInset } from '../../hooks/useTopInset';
import { asList } from '../../utils/format';

function pkr(n) {
  return `PKR ${Number(n || 0).toLocaleString('en-US')}`;
}

export default function EarnPreviewScreen({ onInvite, onSkip }) {
  const topInset = useTopInset();
  const { sessionId, user } = useSession();
  const [banks, setBanks] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [bank, setBank] = useState('');
  const [tier, setTier] = useState('');
  const [applied, setApplied] = useState(false);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([
      getBanks(sessionId, user.id),
      getTiers(sessionId, user.id),
    ])
      .then(([bankRows, tierRows]) => {
        if (!live) return;
        setBanks(asList(bankRows));
        setTiers(asList(tierRows));
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [sessionId, user.id]);

  const apply = async () => {
    if (!bank || !tier || applied) return;
    setApplying(true);
    setError('');
    try {
      const rows = asList(await listCardEarnPreview(sessionId, user.id, bank, tier, { city: user?.city || 'Karachi' }));
      setStores(rows);
      setApplied(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const ready = Boolean(bank && tier);
  const applyLabel = ready ? 'Apply' : 'Select your card first';

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <Pressable onPress={onSkip} style={styles.skip} accessibilityRole="button">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
      <Text style={styles.title}>See what your card{'\n'}could earn you</Text>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} keyboardShouldPersistTaps="handled">
        <VirtualCard
          bankName={bank || 'Select bank'}
          cardTier={tier || 'Select tier'}
          displayName={user.display_name}
        />
        <Text style={styles.trust}>Bank and tier only. Your card number stays with you.</Text>
        {!applied ? (
          <>
            <Dropdown label="Bank" placeholder="Choose a bank" options={banks} value={bank} onChange={setBank} />
            <Dropdown label="Tier" placeholder="Choose a tier" options={tiers} value={tier} onChange={setTier} />
            <PrimaryButton
              label={applying ? 'Please wait…' : applyLabel}
              disabled={!ready || applying}
              loading={applying}
              onPress={apply}
            />
          </>
        ) : null}

        {loading ? <LoadingState /> : null}
        <ErrorBanner message={error} />

        {applied ? (
          stores.length === 0 ? (
            <Text style={styles.empty}>No Peekaboo offers for this card yet.</Text>
          ) : (
            <CardPager
              items={stores}
              keyOf={(item) => String(item.store_id)}
              dotsLabel="Store"
              renderItem={(item) => (
                <View style={styles.slide}>
                  <Text style={styles.store}>{item.store_name}</Text>
                  {item.save_pkr > 0 ? (
                    <View style={styles.money}>
                      <View>
                        <Text style={[styles.cap, styles.earnCap]}>You earn</Text>
                        <Text style={styles.earn}>{pkr(item.earn_pkr)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.cap}>They save</Text>
                        <Text style={styles.save}>{pkr(item.save_pkr)}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.empty}>No saving on the sample order.</Text>
                  )}
                  <Text style={styles.sample}>Order amount: {pkr(item.sample_amount)}</Text>
                </View>
              )}
            />
          )
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <Text style={styles.hook}>
          Have the card? <Text style={styles.hookStrong}>Someone you trust could save with it.</Text>
        </Text>
        {applied ? (
          <PrimaryButton label="Invite people to use my card" onPress={onInvite} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 20,
  },
  skip: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text3,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.hero,
    lineHeight: 32,
    color: theme.colors.text,
    marginBottom: 16,
  },
  body: {
    flex: 1,
  },
  bodyInner: {
    gap: 12,
    paddingBottom: 12,
  },
  trust: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
    lineHeight: 18,
  },
  empty: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  slide: {
    backgroundColor: theme.colors.bg2,
    borderRadius: theme.radius.card,
    padding: 16,
    marginRight: 12,
    gap: 10,
  },
  store: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    color: theme.colors.text,
  },
  money: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cap: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  earnCap: {
    color: theme.colors.green,
  },
  earn: {
    marginTop: 4,
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.green,
  },
  save: {
    marginTop: 4,
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.text,
  },
  sample: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.small,
    color: theme.colors.text3,
  },
  bar: {
    paddingVertical: 16,
    gap: 12,
  },
  hook: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    lineHeight: 20,
    color: theme.colors.text2,
  },
  hookStrong: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bodyMedium,
  },
});
