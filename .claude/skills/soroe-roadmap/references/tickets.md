# v1.0 全チケット定義

`docs/soroe-app-store-launch-roadmap.md` の機械的な作業版。着手前に該当行だけを読む。

「参照」列の指定を `sed -n '199,229p' docs/soroe-functional-specification.md` のように部分読みする。仕様書を頭から読まない。

略記：
- `SPEC` = `docs/soroe-functional-specification.md`
- `PD` = `docs/family-checklist-product-design.md`
- `BL` = `docs/soroe-implementation-backlog.md`

---

## Step 0 — 外部の待ち時間を消す（11h）

コードを書かない作業を含む。DNS反映に最大48時間かかるため、**EXT-004 を全体の最初に着手する**。待っている間に Step 1 を進める。

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| EXT-004 | OTP送信用メールプロバイダ契約、送信ドメインの SPF/DKIM/DMARC 認証、Fromアドレスと問い合わせ受信先の確定 | 1h | - | `SPEC` L633-648（運用値）、`docs/firebase-deploy.md` | プロバイダ管理画面で送信ドメインが Verified。`docs/firebase-deploy.md` に From アドレスとDNS設定を追記してコミット |
| EXT-001 | App Store Connect にアプリレコード作成。App ID `com.soroe.app`、Capabilities は Sign in with Apple と Associated Domains のみ有効化 | 1h | - | `apps/mobile/app.config.ts` | Push と In-App Purchase を有効化していない。`docs/` に登録内容を記録 |
| EXT-002 | 独自ドメインを Firebase Hosting へ接続し `/.well-known/apple-app-site-association` を配信。`app.config.ts` の `applinks:soroe.app` と Android intentFilter の host を実ドメインへ差し替え | 3h | EXT-001 | `SPEC` L260-298（招待）、`apps/mobile/app.config.ts`、`firebase.json` | 実機で招待URLをタップしてアプリが開く。AASA が `Content-Type: application/json` でリダイレクトなしに返る |
| EXT-003 | 利用規約・プライバシーポリシー・サポートページを同ドメインで公開。Analytics/Crashlytics の収集項目、OTPメールの用途、アカウント削除手順を明記 | 3h | EXT-002 | `PD` L655-665（プライバシー）、`SPEC` L485-494（設定） | 3URLが公開され、設定画面から開ける |
| MAIL-001 | `functions/src/emailOtp/emailProvider.ts` の `ConsoleEmailProvider` を実プロバイダ実装へ差し替え。APIキーは Functions Secret、送信失敗の扱いとバウンス確認まで | 3h | EXT-004 | `functions/src/emailOtp/`、`docs/firebase-deploy.md`（Secret設定の前例） | 本番 Functions から実際にOTPメールが届く。`requestEmailOtp` の既存テストが緑のまま |

---

## Step 1 — リストのコア体験（15h）

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| LIST-003 | リスト詳細の購読、高速追加、チェック・再開、未完了/完了の表示 | 7h | LIST-001, LIST-002（完了済） | `SPEC` L199-229（LIST-04）、`SPEC` L52-66（共通画面状態）、`PD` L361-406（リスト） | 入力欄を維持したまま連続追加でき、自分の操作が即時反映される。オフラインでも追加できる |
| LIST-004 | 項目編集（名前1〜100文字、数量、単位、カテゴリ、メモ500文字、担当者、期限）と論理削除 | 5h | LIST-003 | `SPEC` L230-248（ITEM-01）、`SPEC` L67-75（入力・保存） | 種別に応じてフィールドが出し分けられる。削除が論理削除になる |
| LIST-006 | リスト複製、論理削除、30日復元。複製は Functions で Free上限を原子的に判定 | 3h | LIST-004 | `SPEC` L249-257（LIST-05）、`SPEC` L30-38（上限の数え方）、`PD` L209-218 | 所有者だけが削除でき、30日以内に復元できる。**アーカイブは v1.0 では実装しない** |

---

## Step 2 — 共有（24h）

v1.0 の価値の中心。ここが山場。

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| SHARE-001 | `members` とユーザー側一覧参照、owner/editor の Security Rules。追加と一覧参照作成は原子的・冪等 | 6h | LIST-001 | `SPEC` L39-51（権限）、`PD` L788-853（コレクション・主要ドキュメント）、`PD` L861-870（整合性）、`firestore.rules` | `functions/src/rules/firestore.rules.test.ts` に owner / editor / 非メンバーの読み書きを網羅したケースが入り、緑 |
| SHARE-002 | `createInvite` / `acceptInvite` / 取消。乱数+ハッシュトークン、期限7日、requestId冪等、既参加・自己招待・削除済み・Free上限の検証 | 7h | SHARE-001, AUTH-005（完了済） | `SPEC` L260-298、`PD` L873-895（Callable・冪等性）、`functions/src/emailOtp/otpCode.ts`（トークン生成の前例） | 全異常系のユニットテストが緑。同一 uid+requestId が同じ結果を返す |
| SHARE-003 | 招待画面、招待プレビュー、受諾、OS共有シートでのリンク送信 | 4h | SHARE-002, EXT-002 | `SPEC` L260-298、`apps/mobile/src/app/invite/[token].tsx`、`apps/mobile/src/features/session/pending-invite.ts` | 未認証で招待URLを開いても、認証後に受諾へ戻る。**メール招待とQRは実装しない** |
| SHARE-004 | メンバー削除、招待取消、編集者の退出、所有権移譲 | 5h | SHARE-001〜003 | `SPEC` L299-306（SHARE-03）、`SPEC` L39-51 | 最後の owner は退出できない。権限喪失後は購読が止まる |
| SHARE-005 | 実機2台で「作成→招待→受諾→追加→完了→権限喪失」を通す | 2h | SHARE-004 | `SPEC` L574-581（AC-01）、`PD` L1055-1066（実機テスト） | `SPEC` の AC-01 に検証結果を追記してコミット |

---

## Step 3 — オフライン（12h）

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| OFF-001 | ネットワーク・Firestore pending writes・同期失敗を監視し、オフラインBannerと未同期件数を表示 | 4h | LIST-003, SHARE-001 | `SPEC` L523-531（OFFLINE-01）、`SPEC` L540-550（ERROR-01）、`docs/spike-001-offline-sync.md`、`apps/mobile/src/app/dev/offline-sync.tsx` | 機内モードで Banner が出て、復帰で消える。オンライン必須機能には理由を表示する |
| OFF-002 | フィールド単位更新、updatedAt比較、削除優先、Last Write Wins | 4h | OFF-001 | `SPEC` L532-539（SYNC-01）、`PD` L431-443（同期・オフライン） | 別項目の同時変更が自動統合される。**手動の競合比較UIは作らない** |
| OFF-003 | 機内モード追加・編集・完了・削除、2端末同時編集、削除対編集、復帰後同期の検証 | 4h | OFF-002 | `SPEC` L589-594（AC-03） | `SPEC` の AC-03 に検証結果を追記してコミット |

---

## Step 4 — 設定とアカウント削除（13h）

**審査必須。** Guideline 5.1.1(v) はアカウント作成できるアプリにアプリ内削除を義務づけている。

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| SET-001 | 設定・プロフィール・日英切替・認証方法の追加/解除・データ/プライバシー・規約・問い合わせ・バージョン・ログアウト | 4h | EXT-003, SHARE-004 | `SPEC` L485-503（SET-01, SET-03）、`SPEC` L76-83（多言語）、`PD` L676-685 | 最後の認証方法は解除できない。変更が即時UIへ反映される。**プラン欄は置かない** |
| DEL-001 | 所有リストの移譲/削除解決、再認証、7日猶予、取消、スケジュール削除。個人データ削除と Sign in with Apple トークン失効 | 7h | SET-001, SHARE-004 | `SPEC` L504-522（SET-04）、`PD` L312-350（認証・アカウント）、[Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple) | 削除予約後に取消でき、猶予終了で実削除される。Apple のトークンが失効する |
| DEL-002 | 未解決owner、取消、猶予終了、Apple/Google/メール各利用者のテスト | 2h | DEL-001 | `SPEC` L617-623（AC-07） | `SPEC` の AC-07 に検証結果を追記してコミット |

---

## Step 5 — 監視（7h）

TestFlight より前に入れる。入れないとテスターのクラッシュが拾えず、原因不明のまま時間を溶かす。

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| OBS-001 | AnalyticsGateway とイベント型。認証→初回リスト、作成→共有、招待→共同編集を計測 | 4h | SHARE-005 | `PD` L1011-1032（分析イベント）、`SPEC` L551-571（イベント共通属性）、`PD` L655-665（プライバシー） | リスト名・項目名・メール・自由入力を送らないことを**テストで**担保する |
| OBS-002 | Crashlytics を development / production へ設定。source map/symbol、release、環境、匿名エラーID | 3h | ENV-002（完了済） | `PD` L636-643（可用性・復旧） | テストクラッシュと非致命エラーが symbol 付きで管理画面へ届く |

---

## Step 6 — 品質（10h）

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| QA-001 | Domain / Rules / Functions / Repository / 主要UI の不足テストを埋める。上限、権限、OTP、招待をCIで再現 | 4h | Step 0〜5 完了 | `PD` L1035-1044（自動テスト） | `pnpm run ci` と `pnpm --filter functions run test:rules` が緑 |
| QA-002 | 最重要E2E（登録→リスト作成→招待→受諾→共同編集）を Maestro で1本自動化。実機2台が要る部分は手順書として残す | 2h | QA-001 | `PD` L1045-1054（最重要E2Eシナリオ） | E2E 1本がローカルで通り、手動手順書が `docs/` にある |
| QA-003 | 小型/大型 iPhone、日英、Dynamic Type、VoiceOver、Wi-Fi→機内モード→復帰の確認 | 4h | QA-002 | `PD` L666-675（アクセシビリティ）、`PD` L1055-1066（実機テスト） | 検証結果と残不具合が `docs/` に記録され、P0/P1 が0件 |

---

## Step 7 — TestFlight と提出準備（8h）

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| REVIEW-001 | レビュアー用デモアカウント。特定のレビュー用アドレスに対してのみ固定コードを受理する allowlist を Functions に実装（Secret管理、対象外は通常フロー、レート制限は維持） | 2h | MAIL-001, QA-003 | `functions/src/emailOtp/verifyEmailOtp.ts`、`functions/src/emailOtp/rateLimit.ts` | レビュー用アドレス+固定コードでログインでき、他アドレスに影響しない。allowlist のユニットテストが緑 |
| REL-003 | `PrivacyInfo.xcprivacy`（Expo の `ios.privacyManifests`）、輸出コンプライアンス `ITSAppUsesNonExemptEncryption=false`、App Store Connect の App Privacy 回答、年齢制限 | 3h | OBS-001, EXT-003 | `apps/mobile/app.config.ts`、https://docs.expo.dev/versions/v57.0.0/config/app/ 、`PD` L655-665 | 提出前検証でプライバシー関連の警告が出ない。App Privacy 回答が Analytics/Crashlytics の実態と一致 |
| REL-001 | production 相当の EAS Build を TestFlight へ配布し、家族テスター5〜8名の観察テスト | 3h | REVIEW-001, REL-003 | `apps/mobile/eas.json`、`PD` L1169-1186（リリース判定） | クラッシュ0件。テスターが説明なしに「リスト作成→招待→共同チェック」を完了。指摘を `docs/` の修正バックログへ反映 |

---

## Step 8 — 提出（5h）

| ID | 内容 | 工数 | 依存 | 参照 | 完了条件 |
|---|---|---:|---|---|---|
| REL-002a | ストア資材。アイコン、スクリーンショット（6.9/6.5インチ）、アプリ名、サブタイトル、説明、キーワード、プロモーションテキスト、価格（無料） | 3h | REL-001 | `docs/icon.png`、`references/verification.md` の審査リスク表 | 必須欄がすべて埋まる。**未実装機能（AI・課金・テンプレート）を説明文とスクリーンショットに含めない** |
| REL-002b | 審査メモを書いて提出。デモアカウント（REVIEW-001のアドレスと固定コード）、デモ用招待リンク、アカウント削除の場所を明記 | 2h | REL-002a | `references/verification.md` の提出直前チェックリスト | チェックリストが全部埋まり「審査待ち」になる |

---

## v1.0 に入れないチケット

思いついても手を出さない。`BL` に該当チケットがあるので、気づいたことはそちらへ1行メモして戻る。

PAY-001〜005（課金）、AI-001〜005（AI生成）、TMPL-001〜004（テンプレート）、NOTIF-001〜003（通知）、LIST-005（並べ替え・検索・数量解析）、LIST-006 のアーカイブ部分、SHARE-003 のメール招待・QR、OFF-002 の手動競合比較UI、AUTH-006 の詳細（SET-001 に統合済み）、Android・Web、Dark Mode。
