import { Children } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import theme from '../constants/theme';
import { hiddenScrollProps } from '../utils/webChrome';
import BottomNav from './BottomNav';

export default function ScreenShell({
  children,
  scroll = true,
  withNav = false,
  activeTab,
  onTabPress,
  contentContainerStyle,
  refreshControl,
  onRefresh,
  refreshing = false,
}) {
  const items = Children.toArray(children);
  const header = items[0];
  const rest = items.slice(1);

  const body = scroll ? (
    <ScrollView
      {...hiddenScrollProps}
      style={styles.scrollView}
      contentContainerStyle={[styles.scroll, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        refreshControl ||
        (onRefresh && Platform.OS !== 'web' ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.green} />
        ) : undefined)
      }
    >
      {rest}
    </ScrollView>
  ) : (
    <View style={[styles.body, contentContainerStyle]}>{rest}</View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      {body}
      {withNav ? <BottomNav activeTab={activeTab} onTabPress={onTabPress} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scroll: {
    paddingBottom: theme.spacing.lg,
  },
  body: {
    flex: 1,
  },
});
