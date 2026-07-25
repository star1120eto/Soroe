import type { UserProfile } from '@soroe/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { signOut, subscribeToAuthState } from './AuthGateway';
import { createUserProfile, getUserProfile } from './SessionRepository';

// loading: 認証状態の確定待ち / needsProfile: Firebase Auth済みだが
// users/{uid}未作成(AUTH-03の初期プロフィール画面へ誘導する状態)。
export type SessionStatus = 'loading' | 'unauthenticated' | 'needsProfile' | 'authenticated';

type SessionContextValue = {
  status: SessionStatus;
  profile: UserProfile | null;
  createProfile: (input: { displayName: string; language: 'ja' | 'en' }) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    return subscribeToAuthState((firebaseUser) => {
      if (!firebaseUser) {
        setUid(null);
        setProfile(null);
        setStatus('unauthenticated');
        return;
      }

      setUid(firebaseUser.uid);
      getUserProfile(firebaseUser.uid).then((existing) => {
        setProfile(existing);
        setStatus(existing ? 'authenticated' : 'needsProfile');
      });
    });
  }, []);

  const createProfile = useCallback(
    async (input: { displayName: string; language: 'ja' | 'en' }) => {
      if (!uid) {
        throw new Error('サインインしていない状態ではプロフィールを作成できません');
      }
      const created = await createUserProfile(uid, input);
      setProfile(created);
      setStatus('authenticated');
    },
    [uid]
  );

  const value = useMemo<SessionContextValue>(
    () => ({ status, profile, createProfile, signOut }),
    [status, profile, createProfile]
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
