import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setUnauthorizedHandler } from '../api/client';
import { logout as logoutApi } from '../api/auth';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../utils/sessionStore';

const SessionContext = createContext(null);

export function SessionProvider({ children, onRequireLogin }) {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  const clearSession = useCallback(async () => {
    setSession(null);
    await clearStoredSession();
  }, []);

  const persistSession = useCallback(async (next) => {
    setSession(next);
    await writeStoredSession(JSON.stringify(next));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await readStoredSession();
        if (active && raw) {
          setSession(JSON.parse(raw));
        }
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      onRequireLogin?.();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, onRequireLogin]);

  const signIn = useCallback(
    async (result) => {
      await persistSession(result);
    },
    [persistSession]
  );

  const updateUser = useCallback(
    async (patch) => {
      if (!session) return;
      const next = { ...session, user: { ...session.user, ...patch } };
      setSession(next);
      await writeStoredSession(JSON.stringify(next));
    },
    [session]
  );

  const signOut = useCallback(async () => {
    if (session?.session_id && session?.user?.id) {
      try {
        await logoutApi(session.session_id, session.user.id);
      } catch {
        // Session may already be revoked.
      }
    }
    await clearSession();
  }, [session, clearSession]);

  const value = useMemo(
    () => ({
      session,
      booting,
      signIn,
      signOut,
      updateUser,
      sessionId: session?.session_id,
      user: session?.user,
    }),
    [session, booting, signIn, signOut, updateUser]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
