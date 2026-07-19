# Soroe iPhone MVP 実装バックログ

| 項目 | 内容 |
|---|---|
| 文書バージョン | 1.1 |
| 作成日 | 2026-07-19 |
| 開発体制 | 1人、週10〜15時間 |
| 対象 | iPhone版 MVP |
| 優先順位 | P0: リリース必須 / P1: 仕様変更を合意できれば延期可能 |
| 見積単位 | 実作業時間。調査、実装、同一チケット内の基本テストを含む |

## 1. このバックログの位置づけ

この文書は、次の資料を実装可能なチケットへ変換したものである。

- `family-checklist-product-design.md`
- `soroe-functional-specification.md`
- `soroe-technology-stack-evaluation.md`
- `Design.pdf`
- `DesignSystem.pdf`

選定済みの画面デザインは「やさしい家族」。MVPではLight Modeを正とし、Phosphor Icons Regularの `ph:*` をローカル利用する。見出しはZen Maru Gothic、本文とUIはNoto Sans JPを基本とする。

技術スタックは `soroe-technology-stack-evaluation.md` の `STACK-GATE-01` を通過するまで確定扱いにしない。第一候補のReact Native FirebaseはExpo Goに含まれないネイティブコードを使うため、PoCはExpo Development BuildとRelease相当Buildで行う。アカウント削除では、アプリ内の削除導線に加え、Sign in with Apple利用者のトークン失効処理も実装対象とする。

## 2. 実行ルール

### 2.1 チケット運用

- WIPは常に1件。着手中のチケットを完了させてから次へ進む。
- 8時間を超えそうなチケットは、着手前に分割する。
- 各週の実装枠のうち20%を、バグ修正、実機確認、依存パッケージ更新に残す。
- 各チケットは、コード、テスト、必要な設定、短い技術メモまでを完了範囲とする。
- P0の未完了がある間は、P1やPhase 2機能へ着手しない。
- リスト名、項目名、メールアドレス、AI自由入力をログや分析へ送らない。

### 2.2 Definition of Ready

次を満たしたチケットだけを着手する。

- 入出力、権限、オンライン必須かどうかが決まっている。
- 依存チケットが完了している。
- 外部サービス作業がある場合、必要な権限とテスト環境が利用できる。
- 画面チケットには、通常、空、読込、エラー、無効、オフラインの必要状態が示されている。

### 2.3 Definition of Done

- TypeScriptの型検査、Lint、対象テストが成功する。
- エラー、連打、戻る操作、通信断のうち該当ケースを確認する。
- 主要操作にアクセシビリティラベルがあり、タップ領域が44×44pt以上である。
- 表示文言が日本語・英語リソースを経由する。
- 個人情報や本文データをログ・分析へ送っていない。
- 実機確認が必要なチケットは、iPhone Development Buildで確認する。

## 3. 全体見積とマイルストーン

### 3.1 Epic別見積

| 順 | Epic | 工数 | 累計 | 成果 |
|---:|---|---:|---:|---|
| 0 | 技術選定ゲート・開発基盤PoC | 19h | 19h | STACK-GATE-01合格と2端末同期の成立 |
| 1 | 画面遷移・デザインシステム | 16h | 35h | 共通UIと全画面の骨格 |
| 2 | Google・Apple・メール認証 | 24h | 59h | 登録、ログイン、初期プロフィール |
| 3 | リスト作成・編集・チェック | 33h | 92h | 単独利用のコア体験 |
| 4 | 家族招待・リアルタイム共有 | 25h | 117h | 2人の共同編集 |
| 5 | オフライン・同期・競合 | 14h | 131h | 機内モードからの復帰 |
| 6 | 公式・マイテンプレート | 17h | 148h | 再利用体験 |
| 7 | AIリスト生成 | 25h | 173h | 条件入力から編集可能な下書き生成 |
| 8 | RevenueCat課金 | 20h | 193h | 月額・年額、復元、権利反映 |
| 9 | 通知・設定・アカウント削除 | 27h | 220h | 運用と審査に必要な設定群 |
| 10 | 分析・クラッシュ監視 | 7h | 227h | 主要ファネルと障害観測 |
| 11 | TestFlight・App Store申請 | 20h | 247h | リリース候補と申請 |

合計は247時間。週15時間なら約16.5週、週10時間なら約24.7週である。20%の不確実性を含めると、現実的な完了幅は約20〜30週となる。

既存の14週間案は、毎週15時間をほぼ全て確保しても210時間であるため、フル仕様のままでは37時間不足する。14週間を固定する場合は、後述の「圧縮案」を先に合意する。

### 3.2 マイルストーン

| マイルストーン | 完了Epic | 累計 | 週15h | 週10h | 判定条件 |
|---|---:|---:|---:|---:|---|
| M1 コア共有Alpha | 0〜5 | 131h | 9週 | 14週 | 実機2台で作成、招待、共同チェック、オフライン復帰 |
| M2 課金Beta | 0〜8 | 193h | 13週 | 20週 | テンプレート、AI、Sandbox購入・復元が動作 |
| M3 App Store候補 | 0〜11 | 247h | 17週 | 25週 | 全リリース判定を満たす |

## 4. 実装バックログ

### EPIC-00 技術選定ゲート・開発基盤PoC — 19h

#### 完了条件

`STACK-GATE-01` を合格し、採用構成と撤退条件をADRへ記録する。Development Buildを実機2台へ配布でき、Firestoreのリスト項目がリアルタイム反映され、片方を機内モードにして追加・再起動した内容が復帰後に同期される。EPIC-00が完了するまで機能UIへ進まない。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| ENV-001 | P0 | 4h | - | PoC時点の最新安定版を使い、pnpm workspaceを `apps/mobile`、`functions`、`packages/shared` の3単位で作る。Expo Router + TypeScript strictでアプリが起動し、採用版をlockfileへ固定する。 |
| ENV-002 | P0 | 5h | ENV-001 | Firebase、RevenueCat等のネイティブmoduleを組み込み、EASのdevelopment/previewプロファイル、環境変数schema、iOS Bundle IDを設定する。Development BuildとRelease相当Buildを実機起動でき、恒常的なnative patchを必要としない。 |
| SPIKE-001 | P0 | 6h | ENV-002 | React Native Firebaseで最小のリスト・項目を作り、実機2台のリアルタイム購読、オフライン書込、offline中の再起動、復帰後同期、同一項目競合を検証する。失敗時は本実装へ進まず、Flutter等の比較PoC要否をADRに記録する。 |
| CI-001 | P0 | 4h | ENV-001 | `lint`、`typecheck`、単体テスト、Functions buildを1コマンドとCIで実行する。main相当ブランチは失敗時にマージ不可とする。 |

### EPIC-01 画面遷移・デザインシステム — 16h

#### 完了条件

全画面のルートへ遷移でき、デザインシステムのトークンと共通コンポーネントがStorybook相当の確認画面または開発用カタログで検証できる。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| UI-001 | P0 | 5h | ENV-001 | `DesignSystem.pdf` のカラー、文字、余白、角丸、枠線、影を型付きトークン化する。Zen Maru Gothic、Noto Sans JP、使用する `ph:*` アイコンをローカルバンドルし、ランタイムIconify APIへ依存しない。 |
| UI-002 | P0 | 7h | UI-001 | Button、Input、ListRow、Checkbox、Chip、TemplateCard、PlanCard、BottomTab、Banner、EmptyState、ErrorState、Skeletonを実装する。通常、押下、選択、無効、読込、エラーの状態と44×44ptを確認する。 |
| NAV-001 | P0 | 4h | ENV-001 | Expo Routerで未認証、認証済み、モーダル、自前ドメインのUniversal Linkによる招待ルートを作る。下部4タブと認証ガードを用意し、招待URLを未認証状態でも保持できる。Firebase Dynamic Linksは使用しない。 |

### EPIC-02 Google・Apple・メール認証 — 24h

#### 完了条件

3方式で新規登録と再ログインができ、初回プロフィールを保存できる。認証キャンセルはエラー表示にせず、保留中の招待があれば認証後に復帰する。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| AUTH-001 | P0 | 3h | ENV-002, NAV-001 | AuthGateway、SessionRepository、UserProfileスキーマを作る。認証状態からルートを切り替え、`users/{uid}` に表示名、言語、作成日時を保存する。 |
| AUTH-002 | P0 | 4h | AUTH-001 | Sign in with AppleをFirebase Authへ接続する。キャンセル、credential失効、Apple非公開メールを扱い、自動アカウント統合はしない。 |
| AUTH-003 | P1 | 4h | AUTH-001 | Google Sign-InをFirebase Authへ接続する。キャンセル、既存メール衝突、再ログインを扱う。14週間圧縮案では延期候補。 |
| AUTH-004 | P0 | 7h | ENV-002 | `requestEmailOtp` と `verifyEmailOtp` を実装する。6桁、10分、再送60秒、5回失敗、ハッシュ保存、メール/IP/端末レート制限、共通応答、Custom Token発行をテストする。 |
| AUTH-005 | P0 | 4h | AUTH-001〜004 | ログイン、メール入力、OTP入力、初期プロフィール画面を実装する。表示名1〜30文字、日英選択、再送カウント、通信エラー、招待復帰を確認する。 |
| AUTH-006 | P1 | 2h | AUTH-002〜005 | 設定から認証方法を追加・解除し、最後の1方式を解除できないようにする。同一メールのGoogle/メールは本人確認後のみリンクする。 |

### EPIC-03 リスト作成・編集・チェック — 33h

#### 完了条件

1人のユーザーが3種類のリストを作り、項目を高速追加、編集、完了、並べ替えできる。Freeの4件目は保存されず、既存データは失われない。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| LIST-001 | P0 | 6h | SPIKE-001, AUTH-001 | List/ListItem/ListMember/UserListRefのドメイン型、Zodスキーマ、Repository、Firestore converter、Rules、必要なIndexを実装する。Firestore型をUIやドメインへ直接公開しない。権利変更はCallable Functions、項目CRUDはRules付きclient writeに分離する。 |
| LIST-002 | P0 | 6h | LIST-001, UI-002 | リスト一覧、空状態、作成方法選択、作成・編集を実装する。新規作成はCallable FunctionでEntitlementとFree上限を原子的に判定し、名前1〜60文字、3種別、色、アイコン、requestId冪等を確認する。 |
| LIST-003 | P0 | 7h | LIST-001 | リスト詳細の購読、高速追加、チェック・再開、未完了/完了の表示を実装する。入力欄を維持し、自分の操作を即時反映する。 |
| LIST-004 | P0 | 5h | LIST-003 | 項目編集を実装する。名前1〜100文字、数量、単位、カテゴリ、メモ500文字、担当者、期限を種別に応じて表示し、論理削除できる。 |
| LIST-005 | P1 | 5h | LIST-003〜004 | 手動並べ替え、未完了/カテゴリ/担当者フィルター、リスト内検索、同名警告、数量・単位候補抽出を実装する。抽出失敗でも追加を妨げない。 |
| LIST-006 | P0 | 4h | LIST-002〜004 | 複製、アーカイブ、復元、論理削除、30日復元を実装する。複製とアーカイブ解除はFunctionsでFree上限を原子的に判定し、所有者だけがアーカイブ・削除できる。 |

### EPIC-04 家族招待・リアルタイム共有 — 25h

#### 完了条件

ユーザーAがユーザーBを招待し、Bの追加・完了がAへリアルタイム反映される。非メンバー、編集者、オーナーの権限がSecurity Rulesとサーバー処理の両方で守られる。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| SHARE-001 | P0 | 6h | LIST-001 | `members` とユーザー側一覧参照を実装し、owner/editorのRulesをEmulatorで網羅する。メンバー追加と一覧参照作成は原子的・冪等に行う。 |
| SHARE-002 | P0 | 7h | SHARE-001, AUTH-005 | `createInvite`、`acceptInvite`、取消処理を実装する。トークンは乱数＋ハッシュ、期限7日、requestId冪等、既参加、自分招待、削除済み、Free上限を検証する。 |
| SHARE-003 | P0 | 5h | SHARE-002, NAV-001 | 招待画面、招待プレビュー、受諾、OS共有シートのリンク送信を実装する。メール指定とQRはP1扱いとし、圧縮時はリンク共有だけを残す。 |
| SHARE-004 | P0 | 5h | SHARE-001〜003 | メンバー削除、招待取消、編集者の退出、所有権移譲を実装する。最後のownerは退出できず、権限喪失後は購読できない。 |
| SHARE-005 | P0 | 2h | SHARE-004 | 実機2台で「作成→招待→受諾→追加→完了→権限喪失」を通し、AC-01を記録する。 |

### EPIC-05 オフライン・同期・競合 — 14h

#### 完了条件

キャッシュ済みリストを機内モードで開き、追加とチェックが即時反映される。復帰後に自動同期され、別端末へ反映される。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| OFF-001 | P0 | 4h | LIST-003, SHARE-001 | ネットワーク、Firestore pending writes、同期失敗を監視し、オフラインBannerと未同期件数を表示する。オンライン必須機能には理由を表示する。 |
| OFF-002 | P0 | 5h | OFF-001 | フィールド単位更新、updatedAt比較、同一項目の競合確認、削除優先、入力内容コピーを実装する。別項目の変更は自動統合する。 |
| OFF-003 | P0 | 5h | OFF-002 | 機内モード追加・編集・完了・削除、2端末同時編集、削除対編集、復帰後同期を自動/実機テストし、AC-03を記録する。 |

### EPIC-06 公式テンプレート・マイテンプレート — 17h

#### 完了条件

公式テンプレートから不要項目を外してリストを作れ、現在のリストを独立したマイテンプレートとして保存・再利用できる。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| TMPL-001 | P0 | 4h | LIST-001 | 公式テンプレートと項目のスキーマ、日英データ、seed/import/validateコマンドを作る。初期10件で開始し、内容追加だけで20〜30件へ増やせる。 |
| TMPL-002 | P0 | 5h | TMPL-001, LIST-002 | 公式一覧、詳細、項目選択、人数補正、通常リストへの複製を実装する。安全カテゴリの注意を保存前に表示し、キャッシュ済み一覧をオフラインで読める。検索とカテゴリ絞り込みはP1。 |
| TMPL-003 | P0 | 6h | LIST-003 | リストからマイテンプレート保存、一覧、名称変更、編集、削除、リスト作成を実装する。保存と作成はFunctionsで上限を判定し、共有関係、担当、履歴を保存せず、Freeの2件目を拒否する。 |
| TMPL-004 | P0 | 2h | TMPL-002〜003 | 元テンプレート/元リスト変更の非伝播、項目選択、Free上限、オフライン閲覧をテストし、AC-04を記録する。 |

### EPIC-07 AIリスト生成 — 25h

#### 完了条件

条件入力から最大80項目の構造化結果を生成し、項目を編集・除外して通常リストへ保存できる。失敗・安全拒否では回数が戻り、同一requestIdで二重消費されない。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| AI-001 | P0 | 5h | AUTH-001, LIST-001 | 入力/出力Zod、JSON Schema、`aiUsage`、`aiRequests` の予約→生成→確定/返却状態機械を実装する。Free生涯1回、Premium日本時間月20回を原子的に判定する。 |
| AI-002 | P0 | 7h | AI-001 | `generateList` をResponses API + Structured Outputsで実装する。モデル名はRemote Config相当、30秒、形式不正/一時エラー1回再試行、同時1件、最大80件、サーバー再検証、安全拒否を扱う。 |
| AI-003 | P0 | 5h | AI-002, UI-002 | 3ステップ条件入力、確認、生成中、キャンセル、残回数を実装する。用途、人数、年齢帯、期間、季節、特徴、自由入力500文字を正規化する。アプリ再開時にrequestIdから結果を復元する。 |
| AI-004 | P0 | 4h | AI-003, LIST-002 | 結果の選択解除、追加、編集、削除、タイトル/種別変更、保存、評価を実装する。安全注意を表示し、Functions側で保存直前のリスト上限を判定する。 |
| AI-005 | P0 | 4h | AI-002 | 旅行、登山、買い物、学校行事の50ケース評価セットと実行スクリプトを作る。Schema適合、80件以内、重複、危険提案、人数/季節反映を回帰判定する。 |

### EPIC-08 RevenueCatによる月額・年額課金 — 20h

#### 完了条件

Sandboxで月額/年額を購入・復元でき、Premium機能が即時に開放される。期限切れでもデータは削除されず、Free枠を超えたデータは選択式で読み取り専用になる。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| PAY-001 | P0 | 4h | ENV-002 | App Store Connectの月額/年額商品、同一Subscription Group、RevenueCat Offering/Entitlementを設定する。価格、更新、自動更新、解約説明、規約URLを一致させる。 |
| PAY-002 | P0 | 4h | PAY-001, AUTH-001 | RevenueCat SDKをDevelopment Buildへ組み込み、Firebase uidをApp User IDとしてログイン/ログアウト同期する。EntitlementGatewayを作りUI表示とサーバー判定を分離する。 |
| PAY-003 | P0 | 5h | PAY-002, UI-002 | Premium画面、月額/年額選択、購入、復元、キャンセル、保留、失敗、既購入を実装する。成功後は元の操作と入力へ戻る。 |
| PAY-004 | P0 | 5h | PAY-002 | RevenueCat Webhookの署名/認証、外部eventId冪等、`entitlements/{uid}` 同期、短期猶予、期限切れ、3リスト/1テンプレート選択、再契約解放を実装する。 |
| PAY-005 | P0 | 2h | PAY-003〜004 | Sandboxで月額、年額、購入取消、復元、期限切れ、再起動後維持を確認し、AC-06を記録する。 |

### EPIC-09 通知・設定・アカウント削除 — 27h

#### 完了条件

他ユーザーの招待・担当・変更通知を受け、通知タップで対象へ遷移できる。設定変更とアカウント削除がアプリ内で完結する。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| NOTIF-001 | P0 | 4h | AUTH-001, NAV-001 | 価値説明後の通知許可、Expo Push Tokenとnative tokenの登録/更新/無効化、端末管理、通知Deep Linkを実装する。OS拒否時は設定アプリへの案内を出し、将来FCM/APNs directへ移行できる形で保持する。 |
| NOTIF-002 | P0 | 6h | NOTIF-001, SHARE-001 | 招待、承認、担当を即時送信し、項目変更を60〜120秒で集約するjob/trigger/functionを実装する。自分の操作は自分へ送らず、権限喪失端末へ本文を漏らさない。 |
| NOTIF-003 | P0 | 3h | NOTIF-002 | 全体とリスト別の通知設定を実装する。完了通知は初期OFF、全体OFFを優先し、設定変更を即時反映する。 |
| SET-001 | P0 | 5h | AUTH-006, PAY-002 | 設定、プロフィール、日英切替、認証方法、プラン、データ/プライバシー、規約、問い合わせ、バージョン、ログアウトを実装する。変更後すぐUIへ反映する。 |
| DEL-001 | P0 | 7h | SHARE-004, PAY-004, SET-001 | 所有リストの移譲/削除解決、再認証、7日猶予、取消、スケジュール削除を実装する。個人データを削除し、課金継続案内を表示し、Sign in with Apple tokenを失効する。 |
| DEL-002 | P0 | 2h | DEL-001 | 未解決owner、取消、猶予終了、Apple/Google/メール利用者をテストし、AC-07を記録する。 |

### EPIC-10 分析・クラッシュ監視 — 7h

#### 完了条件

主要5ファネルを個人情報なしで確認でき、Development/Productionのクラッシュと非致命エラーを識別できる。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| OBS-001 | P0 | 4h | ENV-002 | AnalyticsGatewayとイベント型を作り、認証→初回リスト、作成→共有、招待→共同編集、AI→保存、Paywall→購入を計測する。本文/メール/自由入力を拒否するテストを置く。 |
| OBS-002 | P0 | 3h | ENV-002 | CrashlyticsをDevelopment BuildとProductionへ設定し、source map/symbol、release、環境、匿名エラーIDを付ける。テストクラッシュと非致命エラーが管理画面へ届く。 |

### EPIC-11 TestFlight・App Store申請 — 20h

#### 完了条件

P0/P1重大不具合が0件で、TestFlightテスターが説明なしにコア共有体験を完了し、App Store審査へ提出できる。

| ID | P | 工数 | 依存 | 実装内容・受け入れ条件 |
|---|:---:|---:|---|---|
| QA-001 | P0 | 4h | EPIC-00〜10 | Domain、Rules、Functions、Repository、主要UIの不足テストを埋める。上限、権限、OTP、招待、AI冪等、WebhookをCIで再現できる。 |
| QA-002 | P0 | 4h | QA-001 | Maestro等で登録、共有、オフライン、上限、課金復元、AI失敗の最重要E2Eを自動化する。実機2台が必要な部分は手順書を残す。 |
| QA-003 | P0 | 4h | QA-002 | 小/大iPhone、日英、Dynamic Type、VoiceOver、通知拒否/許可、Wi-Fi→機内モード→復帰を確認する。P0/P1を0件にする。 |
| REL-001 | P0 | 3h | QA-003 | Production相当のEAS BuildをTestFlightへ配布し、家族テスター5〜8名の観察テストを行う。クラッシュ、完了率、詰まりを修正バックログへ反映する。 |
| REL-002 | P0 | 5h | REL-001 | アイコン、スクリーンショット、説明、キーワード、価格、プライバシー回答、輸出コンプライアンス、規約/プライバシー/サポートURL、審査手順、デモアカウントを用意し提出する。 |

## 5. 14週間へ圧縮する場合の候補

14週×15時間の上限は210時間であり、フル仕様247時間から最低37時間を外す必要がある。次の変更なら、コア価値とApp Store必須要件を比較的守りやすい。

| 延期候補 | 削減目安 | 仕様への影響 |
|---|---:|---|
| Google認証、認証方法の追加・解除 | 6h | 初回はApple + メールOTP。`AUTH-003/006` を初回更新へ移す |
| メール招待、QR招待 | 3h | OS共有シートのリンク招待だけでリリース |
| 手動並べ替え、検索、数量解析、同名警告 | 5h | 高速追加とチェックは維持。`LIST-005` を延期 |
| 公式テンプレートの検索・カテゴリ絞り込み、初期件数20〜30件 | 4h | 初期10件をカテゴリ別表示し、検索は初回更新へ移す |
| 通知の集約とリスト別上書き | 5h | 招待・承認・担当のみ即時通知。一般変更通知は初回更新へ移す |
| AI結果のバックグラウンド復元と評価セット拡充 | 4h | requestId冪等と回数返却は残す。UI復元と評価の一部を延期 |
| 英語UIと英語テンプレート | 6h | 日本限定リリースと整合するが、既存仕様の「日英対応」を変更する必要がある |
| 高度な競合比較UI | 4h | Last Write Winsと削除優先は残し、手動比較は初回更新へ移す |

合計候補は37時間。実際に延期する場合は `soroe-functional-specification.md` の対象機能とMVP完了判定も同時に更新する。アカウント削除、Appleログイン、課金復元、Free上限、オフライン復帰、Security Rules、AI回数の冪等性は延期しない。

## 6. 外部準備バックログ

コード以外の待ち時間をクリティカルパスへ入れないため、次はEPIC-00開始時に着手する。

- Apple Developer Program、App Store Connect、契約・税務・銀行情報。
- iOS Bundle ID、Sign in with Apple、Push Notifications、In-App Purchase capability。
- Firebase development/production project、Cloud Functionsの請求設定、App Check方針。
- EAS projectとiOS credentials。
- OTP送信用ドメイン、DNS認証、Fromアドレス、問い合わせ受信先。
- OpenAI API project、利用上限、サーバー専用API key。
- RevenueCat project、月額/年額product ID、webhook secret。
- 利用規約、プライバシーポリシー、サポートページの公開URL。
- App Store用アプリ名、サブタイトル、説明、キーワード、スクリーンショット文言。

## 7. スコープ外

次はPhase 1へ入れない。

- Android、Web。
- ユーザー公開テンプレート、検索、評価、通報、ブロック、管理画面。
- 子どもアカウント、写真、レシート/バーコード、位置情報、カレンダー、繰り返しタスク。
- 在庫、家計簿、価格比較、コメント、チャット、独自音声入力、AIチャット。
- Dark Mode。Design Systemのsemantic tokenで将来対応可能にするが、MVPでは実装しない。

## 8. 参照する公式資料

- [Expo: Introduction to development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo: Using Firebase](https://docs.expo.dev/guides/using-firebase/)
- [RevenueCat: React Native SDK](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Apple: Handling account deletions and revoking Sign in with Apple tokens](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
