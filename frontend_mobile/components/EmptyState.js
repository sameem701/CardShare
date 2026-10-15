import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

export default function EmptyState({ message }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: theme.spacing.lg,
  },
  text: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.input,
    color: theme.colors.text2,
  },
});
