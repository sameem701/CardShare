import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useRequestInbox } from '../context/RequestInbox';
import { useSession } from '../context/SessionContext';
import { isYourTurn } from '../utils/requestInbox';

const FILTERS = [
  ['urgent', 'Urgent'],
  ['asked', 'As requester'],
  ['holding', 'As card holder'],
];

export default function RequestsScreen({ activeTab, onTabPress, onNavigate, onMenu }) {
  const { user } = useSession();
  const { items, loading, refreshing, error, refresh } = useRequestInbox();
  const [filter, setFilter] = useState('urgent');

  const visible = items.filter((item) => (filter === 'urgent' ? isYourTurn(item) : item.role === filter));

  return (
    <ScreenShell
      withNav
      activeTab={activeTab}
      onTabPress={onTabPress}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <TopBar
        title="Requests"
        displayName={user.display_name}
        onAccount={onMenu}
        actionLabel="New"
        onAction={() => onNavigate('create-request')}
      />
      <View style={styles.filters}>
        {FILTERS.map(([id, label]) => {
          const selected = filter === id;
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {loading ? (
        <LoadingState />
      ) : visible.length === 0 && !error ? (
        <View style={styles.pad}>
          <EmptyState message={filter === 'urgent' ? 'Nothing is waiting on you.' : 'No live requests.'} />
        </View>
      ) : (
        visible.map((item) => (
          <ListCard
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            badgeLabel={item.badge}
            badgeVariant={item.badgeVariant}
            unreadCount={item.unreadCount}
            yourTurn={isYourTurn(item)}
            onPress={() => onNavigate(item.nav.screen, item.nav.params)}
          />
        ))
      )}
      <View style={styles.pad}>
        <ErrorBanner message={error} onRetry={refresh} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
    marginBottom: theme.spacing.lg,
  },
  chip: {
    backgroundColor: theme.colors.bg3,
    borderRadius: theme.radius.pill,
    borderWidth: 0.5,
    borderColor: theme.colors.border2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipOn: {
    backgroundColor: theme.colors.greenDim,
    borderColor: theme.colors.green,
  },
  chipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
  },
  chipTextOn: {
    color: theme.colors.green,
  },
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
});
