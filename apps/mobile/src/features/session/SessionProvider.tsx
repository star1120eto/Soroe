import type { UserProfile } from '@soroe/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { signOut, subscribeToAuthState } from './AuthGateway';
import { createUserProfile, getUserProfile, updateUserLanguage } from './SessionRepository';

// loading: 認証状態の確定待ち / needsProfile: Firebase Auth済みだが
// users/{uid}未作成(AUTH-03の初期プロフィール画面へ誘導する状態)。
export type SessionStatus = 'loading' | 'unauthenticated' | 'needsProfile' | 'authenticated';

type SessionContextValue = {
  status: SessionStatus;
  profile: UserProfile | null;
  createProfile: (input: { displayName: string; language: 'ja' | 'en' }) => Promise<void>;
  setLanguage: (language: 'ja' | 'en') => Promise<void>;
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
      getUserProfile(firebaseUser.uid)
        .then((existing) => {
          setProfile(existing);
          setStatus(existing ? 'authenticated' : 'needsProfile');
        })
        .catch((error) => {
          // 読込に失敗(オフライン・不完全なプロフィール等)しても'loading'のまま固まらないよう、
          // 未認証として扱いログイン画面へ戻す。再度サインインすれば読み直す。
          console.error('getUserProfile failed', error);
          setProfile(null);
          setStatus('unauthenticated');
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

  const setLanguage = useCallback(
    async (language: 'ja' | 'en') => {
      if (!uid) {
        throw new Error('サインインしていない状態では言語を変更できません');
      }
      // 画面へは即時に反映し、サーバーへの保存は待たない(オフラインではupdateが解決しないため。
      // 項目の更新と同じ方針)。保存に失敗したら元の言語へ戻す。
      const previous = profile?.language;
      setProfile((current) => (current ? { ...current, language } : current));
      updateUserLanguage(uid, language).catch((error) => {
        console.error('updateUserLanguage failed', error);
        setProfile((current) => (current && previous ? { ...current, language: previous } : current));
      });
    },
    [uid, profile?.language]
  );

  const value = useMemo<SessionContextValue>(
    () => ({ status, profile, createProfile, setLanguage, signOut }),
    [status, profile, createProfile, setLanguage]
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
