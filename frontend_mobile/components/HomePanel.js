import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import PrimaryButton from './PrimaryButton';

export default function HomePanel({ mark, title, emphasize, body, extra, button, onPress }) {
  return (
    <View style={styles.card}>
      {mark}
      <Text style={[styles.title, !mark && styles.titlePlain, emphasize && styles.titleEmphasis]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {extra}
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
  titlePlain: {
    marginTop: 0,
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
  action: {
    marginTop: theme.spacing.lg,
  },
});
