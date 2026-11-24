import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { EntitlementGateway } from './EntitlementGateway';
import { FREE_SNAPSHOT, type EntitlementSnapshot } from './entitlementModel';
import { purchasesGateway } from './purchasesGateway';

// PAY-002/003: 権利の表示状態を保持する。UI表示専用で、機能の可否は常にサーバー(getPlan)が決める。
type EntitlementContextValue = {
  snapshot: EntitlementSnapshot;
  gateway: EntitlementGateway;
  /** 購入・復元の直後に即時反映する(購読の通知を待たない)。 */
  setSnapshot: (snapshot: EntitlementSnapshot) => void;
  /** SDKから読み直す。失敗しても現在の表示を保つ。 */
  refresh: () => Promise<void>;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({
  children,
  gateway = purchasesGateway,
}: {
  children: ReactNode;
  gateway?: EntitlementGateway;
}) {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(FREE_SNAPSHOT);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    // configure前のsubscribeはSDKが未初期化で失敗するため、configure済みのときだけ購読する。
    gateway
      .configure()
      .then((ready) => {
        if (ready && !cancelled) {
          unsubscribe = gateway.subscribe(setSnapshot);
        }
      })
      .catch((error) => console.error('EntitlementProvider configure failed', error));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [gateway]);

  const refresh = useCallback(async () => {
    try {
      if (await gateway.configure()) {
        setSnapshot(await gateway.getSnapshot());
      }
    } catch (error) {
      console.error('refresh entitlement failed', error);
    }
  }, [gateway]);

  const value = useMemo(() => ({ snapshot, gateway, setSnapshot, refresh }), [snapshot, gateway, refresh]);
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error('useEntitlement must be used within an EntitlementProvider');
  }
  return context;
}
