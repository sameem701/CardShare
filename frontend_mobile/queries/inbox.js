import { queryOptions, useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { getActiveOrders, getIncomingRequests, getUnpaidOrders } from '../api/holder';
import { getActiveRequests, getUnpaidRequests } from '../api/requester';
import { useSession } from '../context/SessionContext';
import { buildRequestItems, isYourTurn, unreadTotal } from '../utils/requestInbox';
import { queryClient } from './client';

function aborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}

export async function loadInbox(sessionId, userId, signal) {
  const [sent, incoming, holding, unpaidAsked, unpaidHolding] = await Promise.allSettled([
    getActiveRequests(sessionId, userId, { signal }),
    getIncomingRequests(sessionId, userId, { signal }),
    getActiveOrders(sessionId, userId, { signal }),
    getUnpaidRequests(sessionId, userId, { signal }),
    getUnpaidOrders(sessionId, userId, { signal }),
  ]);
  aborted(signal);
  const next = buildRequestItems(sent, incoming, holding, unpaidAsked, unpaidHolding);
  if (next.failedAll) {
    throw new Error(next.error || 'Could not load requests.');
  }
  return next;
}

export function inboxQueryOptions(sessionId, userId) {
  return queryOptions({
    queryKey: ['inbox', userId],
    queryFn: ({ signal }) => loadInbox(sessionId, userId, signal),
    staleTime: 30 * 1000,
  });
}

export function useRequestInbox() {
  const { sessionId, user } = useSession();
  const focused = useIsFocused();
  const userId = user?.id;
  const query = useQuery({
    ...inboxQueryOptions(sessionId, userId),
    enabled: Boolean(focused && sessionId && userId),
  });
  const items = query.data?.items ?? [];
  return {
    items,
    loading: query.isPending && query.data === undefined,
    refreshing: query.isFetching && query.data !== undefined,
    error: query.isError
      ? (query.error?.message || 'Could not load requests.')
      : (query.data?.error || ''),
    refresh: query.refetch,
    yourTurn: items.some(isYourTurn),
    unreadTotal: unreadTotal(items),
  };
}

export function useOrderUnread(orderId) {
  const { sessionId, user } = useSession();
  const userId = user?.id;
  const query = useQuery({
    ...inboxQueryOptions(sessionId, userId),
    enabled: false,
  });
  const found = query.data?.items?.find((item) => item.id === orderId);
  return found ? found.unreadCount : undefined;
}

export function writeOrderUnread(userId, orderId, unreadCount) {
  const count = Number(unreadCount) || 0;
  queryClient.setQueryData(['inbox', userId], (current) => {
    if (!current?.items) return current;
    return {
      ...current,
      items: current.items.map((item) => (
        item.id === orderId ? { ...item, unreadCount: count } : item
      )),
    };
  });
  ['order', 'request'].forEach((kind) => {
    queryClient.setQueryData([kind, userId, orderId], (current) => (
      current ? { ...current, unread_count: count } : current
    ));
  });
}

export async function storeUnreadCount(userId, orderId, unreadCount) {
  await queryClient.cancelQueries({ queryKey: ['inbox', userId] });
  writeOrderUnread(userId, orderId, unreadCount);
}
