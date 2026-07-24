import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { signInAnonymously, signOut, subscribeToAuthState } from './AuthGateway';
import { createUserProfile, getUserProfile } from './SessionRepository';

// AUTH-002〜004(Apple/Google/メールOTP)実装までの暫定デフォルト。
// 実サインイン方式が揃い次第、AUTH-005(初期プロフィール画面)が
// 実際の入力値でcreateUserProfileを呼ぶよう置き換える。
const PLACEHOLDER_PROFILE_DEFAULTS = { displayName: '名称未設定', language: 'ja' as const };

export type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';

type SessionContextValue = {
  status: SessionStatus;
  signInForDev: () => Promise<void>;
  signOutForDev: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      if (!firebaseUser) {
        setStatus('unauthenticated');
        return;
      }

      getUserProfile(firebaseUser.uid)
        .then((profile) => profile ?? createUserProfile(firebaseUser.uid, PLACEHOLDER_PROFILE_DEFAULTS))
        .then(() => setStatus('authenticated'));
    });

    return unsubscribe;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      signInForDev: signInAnonymously,
      signOutForDev: signOut,
    }),
    [status]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
