import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { getActiveOrders, getIncomingRequests } from '../api/holder';
import { getActiveRequests } from '../api/requester';
import { useSession } from './SessionContext';
import { buildRequestItems, isYourTurn, unreadTotal } from '../utils/requestInbox';

const RequestInboxContext = createContext(null);

export function RequestInboxProvider({ children }) {
  const { sessionId, user } = useSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    const [sent, incoming, holding] = await Promise.allSettled([
      getActiveRequests(sessionId, user.id),
      getIncomingRequests(sessionId, user.id),
      getActiveOrders(sessionId, user.id),
    ]);
    if (id !== requestId.current) return;

    const next = buildRequestItems(sent, incoming, holding);
    if (!next.failedAll) setItems(next.items);
    setError(next.error);
    setLoading(false);
    setRefreshing(false);
  }, [sessionId, user.id]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    return load();
  }, [load]);

  const value = useMemo(() => ({
    items,
    loading,
    refreshing,
    error,
    load,
    refresh,
    yourTurn: items.some(isYourTurn),
    unreadTotal: unreadTotal(items),
  }), [items, loading, refreshing, error, load, refresh]);

  return (
    <RequestInboxContext.Provider value={value}>
      {children}
    </RequestInboxContext.Provider>
  );
}

export function useRequestInbox() {
  const ctx = useContext(RequestInboxContext);
  if (!ctx) {
    throw new Error('useRequestInbox must be used within RequestInboxProvider');
  }
  return ctx;
}
