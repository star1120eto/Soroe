import type { EntitlementSnapshot, PurchaseOutcome, PurchasablePlan, RestoreOutcome } from './entitlementModel';

// PAY-002: RevenueCat SDKの唯一の窓口(AuthGatewayと同じ位置づけ)。画面・Providerはこのinterfaceだけを
// 使い、SDKそのものを直接importしない。実装は purchasesGateway(.web)、テストはモックに差し替える。

export interface EntitlementGateway {
  /** SDKを初期化する。APIキー未設定なら何もせずfalse(課金なしの環境でも起動できる)。 */
  configure(): Promise<boolean>;
  /** Firebase uidをApp User IDとして紐づける。 */
  logIn(uid: string): Promise<EntitlementSnapshot>;
  logOut(): Promise<void>;
  getSnapshot(): Promise<EntitlementSnapshot>;
  /** 購入できるプラン。Offering未設定・取得失敗時は空。 */
  getPlans(): Promise<PurchasablePlan[]>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<RestoreOutcome>;
  /** 権利の変化(購入・更新・期限切れ)を購読する。戻り値で解除。 */
  subscribe(listener: (snapshot: EntitlementSnapshot) => void): () => void;
}

/** 認証状態にApp User IDを合わせる。失敗しても認証・画面を止めない(権利はWebhook経由でサーバーが持つ)。 */
export async function syncPurchasesUser(gateway: EntitlementGateway, uid: string | null): Promise<void> {
  try {
    if (!(await gateway.configure())) {
      return;
    }
    if (uid) {
      await gateway.logIn(uid);
    } else {
      await gateway.logOut();
    }
  } catch (error) {
    console.error('syncPurchasesUser failed', error);
  }
}
