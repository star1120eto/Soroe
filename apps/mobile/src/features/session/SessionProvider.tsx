import { createContext, useContext, useState, type ReactNode } from 'react';

// Placeholder routing gate for NAV-001. AUTH-001 replaces this with real
// Firebase Auth state (AuthGateway/SessionRepository) behind the same
// useSession() interface, so (auth)/(app) route guards don't need to change.
export type SessionStatus = 'unauthenticated' | 'authenticated';

type SessionContextValue = {
  status: SessionStatus;
  signInForDev: () => void;
  signOutForDev: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('unauthenticated');

  return (
    <SessionContext.Provider
      value={{
        status,
        signInForDev: () => setStatus('authenticated'),
        signOutForDev: () => setStatus('unauthenticated'),
      }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
