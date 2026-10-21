import { createContext, useContext } from 'react';

const AppActionsContext = createContext(null);

export function AppActionsProvider({ children, value }) {
  return (
    <AppActionsContext.Provider value={value}>
      {children}
    </AppActionsContext.Provider>
  );
}

export function useAppActions() {
  const value = useContext(AppActionsContext);
  if (!value) {
    throw new Error('useAppActions must be used within AppActionsProvider');
  }
  return value;
}
