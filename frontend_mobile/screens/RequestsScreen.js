import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import ListCard from '../components/ListCard';
import LoadingState from '../components/LoadingState';
import ScreenShell from '../components/ScreenShell';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useRequestInbox } from '../context/RequestInbox';
import { useSession } from '../context/SessionContext';
import { useAppActions } from '../navigation/AppActions';
import { openScreen } from '../navigation/openScreen';
import { isYourTurn } from '../utils/requestInbox';

function inFilter(item, id) {
  if (id === 'urgent') return isYourTurn(item);
  return item.role === id;
}

function filterHasUnread(items, id) {
  return items.some((item) => inFilter(item, id) && Number(item.unreadCount) > 0);
}

const FILTERS = [
  ['urgent', 'Urgent'],
  ['asked', 'As requester'],
  ['holding', 'As card holder'],
];

export default function RequestsScreen() {
  const navigation = useNavigation();
  const { openMenu } = useAppActions();
  const { user } = useSession();
  const { items, loading, refreshing, error, refresh } = useRequestInbox();
  const [filter, setFilter] = useState('urgent');

  const visible = items.filter((item) => inFilter(item, filter));

  return (
    <ScreenShell
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <TopBar
        title="Requests"
        displayName={user.display_name}
        onAccount={openMenu}
        actionLabel="New"
        onAction={() => openScreen(navigation, 'create-request')}
      />
      <View style={styles.filters}>
        {FILTERS.map(([id, label]) => {
          const selected = filter === id;
          const unread = filterHasUnread(items, id);
          return (
            <Pressable
              key={id}
              onPress={() => setFilter(id)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={unread ? `${label}, unread messages` : label}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
              {unread ? <View style={styles.dot} /> : null}
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
            onPress={() => openScreen(navigation, item.nav.screen, item.nav.params)}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.red,
  },
  pad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
});
