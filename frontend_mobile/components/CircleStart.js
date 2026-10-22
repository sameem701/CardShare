import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import theme from '../constants/theme';
import PrimaryButton from './PrimaryButton';

const PAYOFF = 'Add someone you trust. Their card can lower the price. Yours can earn when you shop for them.';

function personName(member) {
  return member.contact_name || member.display_name || 'Someone';
}

function CircleMark() {
  const color = theme.colors.green;
  return (
    <Svg width={168} height={72} viewBox="0 0 168 72" fill="none">
      <Circle cx="24" cy="24" r="9" stroke={color} strokeWidth="1.8" />
      <Path d="M8 58c1.4-10 7-15 16-15s14.6 5 16 15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M46 36h18" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Rect x="64" y="22" width="40" height="28" rx="5" stroke={color} strokeWidth="1.8" />
      <Path d="M72 33h24" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M72 40h14" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M104 36h18" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="144" cy="24" r="9" stroke={color} strokeWidth="1.8" />
      <Path d="M128 58c1.4-10 7-15 16-15s14.6 5 16 15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export default function CircleStart({ members, onAdd, onOpenCircle }) {
  const received = members.filter((member) => member.c_status === 'pending' && !member.is_sender);
  const sent = members.filter((member) => member.c_status === 'pending' && member.is_sender);
  const invited = received.length > 0;

  let title = 'Save on an order, or earn when you place one.';
  let body = PAYOFF;
  let button = 'Add someone';
  let onPress = onAdd;
  let emphasize = false;

  if (invited) {
    title = received.length === 1 ? `${personName(received[0])} invited you` : 'You have invites';
    body = PAYOFF;
    button = received.length === 1 ? 'See invite' : 'See invites';
    onPress = onOpenCircle;
    emphasize = true;
  } else if (sent.length) {
    title = 'Invite sent';
    body = '';
    button = 'Add someone else';
  }

  return (
    <View style={styles.card}>
      <CircleMark />
      <Text style={[styles.title, emphasize && styles.titleEmphasis]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {invited && received.length > 1 ? received.map((member) => (
        <Text key={member.id} style={styles.person}>{personName(member)}</Text>
      )) : null}
      {sent.map((member) => (
        <Text key={member.id} style={styles.person}>
          {personName(member)} — waiting for them to accept.
        </Text>
      ))}
      <View style={styles.action}>
        <PrimaryButton label={button} onPress={onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.layout.screenPadding,
    backgroundColor: theme.colors.greenDim,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.green,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 36,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
  },
  titleEmphasis: {
    fontSize: theme.fontSize.display,
    lineHeight: 42,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    lineHeight: 22,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
  person: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.input,
    lineHeight: 24,
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
  action: {
    marginTop: theme.spacing.lg,
  },
});
