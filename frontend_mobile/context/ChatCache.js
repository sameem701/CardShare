import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getMessages } from '../api/chat';
import { useSession } from './SessionContext';
import { asList } from '../utils/format';
import { CHAT_PAGE_SIZE } from '../utils/dashboard';

const ChatCacheContext = createContext(null);

function byTime(a, b) {
  const time = Number(a.created_at) - Number(b.created_at);
  if (time !== 0) return time;
  return String(a.id).localeCompare(String(b.id));
}

function mergeMessages(current, incoming) {
  const map = new Map();
  [...current, ...incoming].forEach((message) => {
    if (message?.id) map.set(message.id, message);
  });
  return [...map.values()].sort(byTime);
}

const emptyThread = () => ({
  messages: [],
  loading: false,
  loadingOlder: false,
  error: '',
  hasMore: true,
});

export function ChatProvider({ children }) {
  const { sessionId, user } = useSession();
  const [threads, setThreads] = useState({});
  const started = useRef(new Set());
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const userId = user?.id;

  const prefetch = useCallback((threadId) => {
    if (!sessionId || !userId || !threadId) return undefined;
    if (started.current.has(threadId)) return undefined;
    started.current.add(threadId);
    setThreads((current) => ({
      ...current,
      [threadId]: { ...emptyThread(), ...(current[threadId] || {}), loading: true, error: '' },
    }));

    return getMessages(sessionId, userId, threadId, { limit: CHAT_PAGE_SIZE })
      .then((rows) => {
        const messages = asList(rows);
        setThreads((current) => ({
          ...current,
          [threadId]: {
            messages,
            loading: false,
            loadingOlder: false,
            error: '',
            hasMore: messages.length >= CHAT_PAGE_SIZE,
          },
        }));
      })
      .catch((err) => {
        started.current.delete(threadId);
        setThreads((current) => ({
          ...current,
          [threadId]: {
            ...(current[threadId] || emptyThread()),
            loading: false,
            error: err.message,
          },
        }));
      });
  }, [sessionId, userId]);

  const refreshNewest = useCallback(async (threadId) => {
    if (!sessionId || !userId || !threadId) return;
    try {
      const messages = asList(await getMessages(sessionId, userId, threadId, { limit: CHAT_PAGE_SIZE }));
      setThreads((current) => {
        const existing = current[threadId] || emptyThread();
        return {
          ...current,
          [threadId]: {
            ...existing,
            messages: mergeMessages(existing.messages, messages),
            loading: false,
            error: '',
          },
        };
      });
    } catch (err) {
      setThreads((current) => ({
        ...current,
        [threadId]: {
          ...(current[threadId] || emptyThread()),
          loading: false,
          error: err.message,
        },
      }));
    }
  }, [sessionId, userId]);

  const loadOlder = useCallback(async (threadId) => {
    const existing = threadsRef.current[threadId];
    if (!sessionId || !userId || !existing?.messages?.length || existing.loadingOlder || !existing.hasMore) {
      return;
    }
    const oldest = existing.messages[0];
    setThreads((current) => ({
      ...current,
      [threadId]: { ...current[threadId], loadingOlder: true },
    }));
    try {
      const older = asList(await getMessages(sessionId, userId, threadId, {
        beforeCreatedAt: oldest.created_at,
        beforeId: oldest.id,
        limit: CHAT_PAGE_SIZE,
      }));
      setThreads((current) => ({
        ...current,
        [threadId]: {
          ...current[threadId],
          messages: mergeMessages(older, current[threadId]?.messages || []),
          loadingOlder: false,
          hasMore: older.length >= CHAT_PAGE_SIZE,
        },
      }));
    } catch (err) {
      setThreads((current) => ({
        ...current,
        [threadId]: { ...current[threadId], loadingOlder: false, error: err.message },
      }));
    }
  }, [sessionId, userId]);

  const value = useMemo(
    () => ({ threads, prefetch, refreshNewest, loadOlder }),
    [threads, prefetch, refreshNewest, loadOlder]
  );

  return <ChatCacheContext.Provider value={value}>{children}</ChatCacheContext.Provider>;
}

export function useChatCache() {
  const ctx = useContext(ChatCacheContext);
  if (!ctx) {
    throw new Error('useChatCache must be used within ChatProvider');
  }
  return ctx;
}

export function usePrefetchChat(threadId, enabled) {
  const { prefetch } = useChatCache();
  useEffect(() => {
    if (enabled && threadId) prefetch(threadId);
  }, [enabled, threadId, prefetch]);
}
