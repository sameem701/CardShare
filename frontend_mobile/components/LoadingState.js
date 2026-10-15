import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

export default function LoadingState({ message = 'Loading…' }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={theme.colors.green} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  text: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
});
