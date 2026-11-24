# EPIC-08 課金: PAY-002 / PAY-004 中核 設計メモ

## 範囲
- 対象: PAY-002(EntitlementGateway)、PAY-004の中核(Webhook認証、eventId冪等、`entitlements/{uid}`同期、猶予)。
- 対象外: PAY-001(App Store Connect/RevenueCat設定、外部作業)、PAY-003(Premium画面)、PAY-005(Sandbox確認)、
  期限切れ後の3リスト/1テンプレート選択と読取専用化(Rules変更を伴う)。
- 暫定値(PAY-001確定後に `packages/shared/src/schemas/billing.ts` だけ直す): Entitlement ID `premium`、
  商品ID `soroe_premium_monthly` / `soroe_premium_yearly`、猶予 3日。

## サーバー
- `revenueCatWebhook`(onRequest): `Authorization` ヘッダをSecret `REVENUECAT_WEBHOOK_AUTH`(`defineSecret`)と定数時間比較。
  不一致401、不正body 400、処理失敗は500(RevenueCatが再送)。重複・無視対象は200。
- 冪等: `webhookEvents/revenuecat_{eventId}` と `entitlements/{uid}` を同一transactionで書く。本文は保存しない。
- 古いイベントは `lastEventAtMs` で無視(順不同到着対策)。匿名ID・他Entitlement・未対応種別(TEST等)は記録のみ。
- 保存するのは状態(`premium`/`billing-issue`/`expired`)と期限。実効プラン(free/premium/grace/expired)は
  読取時刻から `resolveEffectivePlan` で導く。猶予中(grace)はPremium機能を維持。
  - BILLING_ISSUE: `grace_period_expiration_at_ms`(無ければ+3日)まで猶予。
  - 期限超過でEXPIRATION未着: 期限+3日まで猶予。EXPIRATIONイベントで即失効。
- `getPlan` は新スキーマを読む。旧形式 `{plan:"premium"}` は無効(Free)。本番に旧形式の文書が無いことが前提
  (Webhook未実装のため書き手がいなかった)。

## モバイル
- `EntitlementGateway` interface + `purchasesGateway`(react-native-purchases、iOSのみ。Webはno-op)。
- `SessionProvider` が認証状態に合わせて `syncPurchasesUser`(configure→logIn/logOut)。APIキー未設定なら何もしない。
- 画面の判定は表示用。機能の可否は常にサーバー(`getPlan`)。

## 未解決
- TRANSFERイベント(アカウント間の権利移動)は未対応。
- Rulesテスト(`test:rules`)はJava未導入のためローカルで未実行。

## 追記: PAY-003 Premium画面(2026-11-24)
- `app/paywall`(モーダル)。`?trigger=list-limit|template-limit|ai-limit|settings` で見出しを切り替える。
- 月額/年額のカードはストア(Offering)から取れたプランだけ表示し、取れなければエラー表示で購入不可(偽の価格を出さない)。
  年額の月換算(約400円)と割引率(約17%)は仕様の定価(480円/4,800円)から計算。
- 購入: 成功→即時反映して `router.back()`(元の画面・入力は残る)。キャンセルは無言、保留/既購入/失敗は状態別メッセージ。
  復元: 対象なしは説明を表示。オフライン時は購入・復元を無効化し理由を表示。
- 規約/プライバシーURLは `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL`(未設定の間は押せない表示。申請前に設定が必要)。
- 導線: 設定のプラン、AI上限、マイテンプレート上限、リスト作成上限、招待受諾の上限。
- `EntitlementProvider` を RootLayout に追加(表示用の権利状態。可否はサーバー判定)。
- 未対応: 計測イベント(paywall_viewed等)はOBS-001、Sandbox実機確認はPAY-005、解約/期限切れ時の選択はPAY-004残り。
