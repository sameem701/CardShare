import { Children } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
      {onRefresh && Platform.OS === 'web' ? (
        <Pressable onPress={onRefresh} style={styles.refresh} accessibilityRole="button" accessibilityLabel="Refresh">
          <Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
      ) : null}
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
  refresh: {
    alignSelf: 'flex-end',
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.sm,
  },
  refreshText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.green,
  },
});
