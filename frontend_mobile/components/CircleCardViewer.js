import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import theme from '../constants/theme';
import CardPager from './CardPager';
import EmptyState from './EmptyState';
import VirtualCard from './VirtualCard';

const AVATARS = [
  { color: theme.colors.green, bg: theme.colors.greenDim, border: 'rgba(0, 200, 122, 0.35)' },
  { color: theme.colors.amber, bg: theme.colors.amberDim, border: 'rgba(245, 166, 35, 0.3)' },
  { color: '#B4A0FF', bg: 'rgba(180, 160, 255, 0.12)', border: 'rgba(180, 160, 255, 0.3)' },
];

function personLabel(person) {
  return person.contact_name || person.display_name || person.phone || 'Someone';
}

function Avatar({ tone }) {
  return (
    <View style={[styles.avatar, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="8" r="3.2" stroke={tone.color} strokeWidth="1.7" />
        <Path d="M5.5 19.5c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5" stroke={tone.color} strokeWidth="1.7" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function Chevron({ direction }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke={theme.colors.text2}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Circle members who share cards, one member at a time. The cards under a
// member swipe; the arrows below move between members. onRequest gets the
// member and the card showing, so the order starts with only that person.
export default function CircleCardViewer({ people, onRequest }) {
  const [bank, setBank] = useState('');
  const [memberIndex, setMemberIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);

  const banks = useMemo(() => {
    const names = new Set();
    people.forEach((person) => {
      (person.cards || []).forEach((card) => {
        if (card.bank_name) names.add(card.bank_name);
      });
    });
    return [...names].sort();
  }, [people]);

  const members = useMemo(() => (
    people
      .map((person) => ({
        person,
        cards: (person.cards || []).filter((card) => !bank || card.bank_name === bank),
      }))
      .filter((entry) => entry.cards.length > 0)
  ), [people, bank]);

  const page = Math.min(memberIndex, Math.max(0, members.length - 1));
  const entry = members[page];

  const onBank = (name) => {
    setBank(name);
    setMemberIndex(0);
    setCardIndex(0);
  };

  const goMember = (delta) => {
    setMemberIndex(Math.max(0, Math.min(members.length - 1, page + delta)));
    setCardIndex(0);
  };

  if (!people.length) {
    return (
      <View style={styles.pad}>
        <EmptyState message="No one in your circle is sharing a card yet." />
      </View>
    );
  }

  const cardNow = entry ? entry.cards[Math.min(cardIndex, entry.cards.length - 1)] : null;
  const label = entry ? personLabel(entry.person) : '';

  return (
    <View>
      {banks.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filterScroll}
        >
          {['', ...banks].map((name) => {
            const on = bank === name;
            return (
              <Pressable
                key={name || 'all'}
                onPress={() => onBank(name)}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityLabel={name || 'All banks'}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{name || 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {entry ? (
        <View style={styles.member}>
          <View style={styles.top}>
            <Avatar tone={AVATARS[page % AVATARS.length]} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>{label}</Text>
              <Text style={styles.shared}>Shared with your circle</Text>
            </View>
            <Text style={styles.cardCount}>
              {entry.cards.length} {entry.cards.length === 1 ? 'card' : 'cards'}
            </Text>
          </View>
          <CardPager
            items={entry.cards}
            resetKey={`${entry.person.id}:${bank}`}
            onIndexChange={setCardIndex}
            dotsLabel="Card"
            renderItem={(card) => (
              <VirtualCard bankName={card.bank_name} cardTier={card.card_tier} displayName={label} />
            )}
          />
          <View style={styles.benefit}>
            <Pressable
              style={styles.ask}
              onPress={() => cardNow && onRequest?.(entry.person, cardNow)}
              accessibilityRole="button"
              accessibilityLabel={`Request ${cardNow ? `${cardNow.bank_name} ${cardNow.card_tier}` : 'card'} from ${label}`}
            >
              <Text style={styles.askText}>Request card</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.pad}>
          <EmptyState message="No members have a card from this bank." />
        </View>
      )}

      {members.length > 1 ? (
        <View style={styles.controls}>
          <Pressable
            style={[styles.nav, page === 0 && styles.navHidden]}
            onPress={() => goMember(-1)}
            disabled={page === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous circle member"
          >
            <Chevron direction="left" />
          </Pressable>
          <Text style={styles.counter}>Member {page + 1} of {members.length}</Text>
          <Pressable
            style={[styles.nav, page >= members.length - 1 && styles.navHidden]}
            onPress={() => goMember(1)}
            disabled={page >= members.length - 1}
            accessibilityRole="button"
            accessibilityLabel="Next circle member"
          >
            <Chevron direction="right" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filters: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border2,
    borderRadius: 20,
    backgroundColor: theme.colors.bg3,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.greenDim,
  },
  chipText: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.text2,
  },
  chipTextOn: {
    color: theme.colors.green,
  },
  member: {
    marginHorizontal: theme.layout.screenPadding,
    padding: 13,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg2,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.text,
  },
  shared: {
    fontFamily: theme.fonts.body,
    fontSize: 10,
    color: theme.colors.text2,
  },
  cardCount: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    color: theme.colors.text2,
  },
  benefit: {
    paddingTop: 12,
    paddingHorizontal: 1,
    paddingBottom: 1,
  },
  ask: {
    backgroundColor: theme.colors.green,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },
  askText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 12,
    color: '#04110B',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 11,
    paddingBottom: 5,
  },
  nav: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  navHidden: {
    opacity: 0,
  },
  counter: {
    fontFamily: theme.fonts.body,
    fontSize: 10,
    color: theme.colors.text3,
  },
});
