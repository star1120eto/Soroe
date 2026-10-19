import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDelayedFlag } from '@/hooks/useDelayedFlag';

import { useSession } from '../session/SessionProvider';
import { reconnect, subscribeToSyncState } from './SyncStateRepository';

// OFF-001: 接続状態。起動直後やアプリ復帰直後は、最初のサーバー応答が届くまでfromCacheがtrueに
// なるため、3秒続いたときだけオフラインとみなす(誤表示のちらつきを避ける)。
const OFFLINE_DELAY_MS = 3000;

type ConnectivityValue = {
  isOffline: boolean;
  isRetrying: boolean;
  retry: () => Promise<void>;
};

const ConnectivityContext = createContext<ConnectivityValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const uid = profile?.uid ?? null;
  const [fromCache, setFromCache] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryingRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      return;
    }
    const unsubscribe = subscribeToSyncState(
      uid,
      (state) => setFromCache(state.fromCache),
      () => setFromCache(true)
    );
    return () => {
      unsubscribe();
      setFromCache(false);
    };
  }, [uid]);

  const isOffline = useDelayedFlag(fromCache, OFFLINE_DELAY_MS);

  const retry = useCallback(async () => {
    // 連打で disableNetwork/enableNetwork が重ならないよう、実行中は無視する。
    if (retryingRef.current) {
      return;
    }
    retryingRef.current = true;
    setIsRetrying(true);
    try {
      await reconnect();
    } finally {
      retryingRef.current = false;
      setIsRetrying(false);
    }
  }, []);

  const value = useMemo(() => ({ isOffline, isRetrying, retry }), [isOffline, isRetrying, retry]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityValue {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within a ConnectivityProvider');
  }
  return context;
}
