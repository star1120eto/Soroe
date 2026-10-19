# SHARE-005 AC-01 コア共有体験の通し確認

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-10-07 |
| 対象 | `soroe-implementation-backlog.md` SHARE-005 / `soroe-functional-specification.md` AC-01 |
| 判定 | **Emulator上の3ユーザー通しは合格(19/19)。iOS Simulator 2台での画面確認は合格。iPhone実機2台での確認は未実施** |
| 実行環境 | Firebase Emulator(Auth / Firestore / Functions)+ Firebase JS Client SDK |

## 1. 未実施の範囲(要フォロー)

バックログのSHARE-005は「実機2台」での確認を求めているが、Apple Developer Program未登録
(ENV-002、GitHub Issue #6)のためiOS実機ビルドを用意できない。そこで次の代替で確認した。

- 実際のクライアントSDK(アプリと同じRules・Callable Functions・リアルタイム購読の経路)を
  **3ユーザー分**(A: オーナー、B・C: 招待される側)起動し、画面操作を除く全経路を通した(下記3章)。
- **iOS Simulator 2台**(iPhone 17 Pro / iPhone 17)にDevelopment Buildを入れ、Firebase Emulatorへ
  接続して、招待〜権限喪失の画面を目視した(下記3.1)。

iPhone実機2台での確認は、ENV-002の解消後に同じ手順で行い、本書へ追記すること。

## 2. 実行方法

```bash
pnpm run build:shared && pnpm run build:functions
pnpm --filter functions exec firebase emulators:exec --only auth,firestore,functions \
  --project soroe-1850a 'pnpm --filter mobile run e2e:share'
```

スクリプト: `apps/mobile/scripts/e2e-share-ac01.mjs`。Emulator以外へは接続しない
(`FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` が無ければ即終了する)。CIでも同じものを実行する。

## 3. 結果

| # | 検証項目 | 結果 |
|---|---|---|
| 1 | Aがリストを作成できる(オーナーのmemberに表示名が入る) | 合格 |
| 2 | Aが項目を追加でき、Aの購読に反映される | 合格 |
| 3 | Aが招待リンクを発行できる(平文トークンは保存されず、IDはSHA-256、期限は約7日)。人ごとに別のリンクを発行でき、先のリンクは取り消されない | 合格 |
| 4 | 未認証でもプレビューを見られる(リスト名・招待者名・メンバー数のみ、項目は含まない) | 合格 |
| 5 | Bは受諾前はリスト・招待を読めない | 合格 |
| 6 | Bが受諾して編集者として参加し、一覧参照が作られる | 合格 |
| 7 | 使われたリンクは失効し(1回のみ有効)、別の人向けのリンクは有効のまま | 合格 |
| 7b | A・B双方の一覧参照の `memberCount` が2になる | 合格 |
| 8 | 同じ受諾の再送で二重参加しない(`already-member`) | 合格 |
| 9 | Bが追加した項目がAにリアルタイム反映される | 合格 |
| 10 | BがAの項目を完了にするとAに反映され、一覧の進捗(1/2完了)が更新される | 合格 |
| 11 | 編集者はオーナー専用の操作(招待作成・メンバー削除・所有権移譲)ができない | 合格 |
| 12 | オーナーは退出できない(最後のownerを守る) | 合格 |
| 13 | AがBを削除すると、Bはサーバーへの新規読取・書込みをすべて拒否され、Bの一覧参照は消える | 合格 |
| 14 | 購読中だったBは、メンバー一覧の購読で `permission-denied` を受け取る | 合格 |
| 15 | 削除**後**にAが追加した項目のデータはBへ配信されず、Bの項目購読は `permission-denied` で終了する | 合格 |
| 16 | 削除されたBは、使用済みの同じリンクでは再参加できない(メンバーと招待リンクは別々に扱う) | 合格 |
| 17 | 別の相手Cは、C向けに発行したリンクで参加できる。B向けのリンクはCにも使えない | 合格 |
| 18 | Aの購読はBの削除後も影響を受けない | 合格 |

### 3.1 iOS Simulator 2台での目視確認(2026-10-07)

| # | 確認内容 | 結果 |
|---|---|---|
| 1 | A(オーナー)のメニューに「リストを編集/複製する/共有・メンバー/アーカイブする/削除する」が出る | 合格 |
| 2 | 共有・メンバー画面に、メンバー(自分・オーナー)と未使用の招待リンクが期限つきで並び、リンクごとに「リンクNを取消」がある | 合格 |
| 3 | 招待リンクを未認証で開くと、招待者名・リスト名・メンバー数だけのプレビューと「ログインして参加」が出る | 合格 |
| 4 | 「ログインして参加」→ログイン画面に「招待を確認しました」が出て、ログイン→プロフィール設定のあと招待が自動で再開し「参加する」が出る | 合格 |
| 5 | 「参加する」でBが編集者として参加し、リスト詳細が開く。担当者チップにA・Bの表示名が出る | 合格 |
| 6 | Aの画面が自動で更新され、メンバーが2人になる。**使われたリンクは一覧から消える**(1回のみ有効) | 合格 |
| 7 | Bが追加した項目がAの画面にリアルタイムで届く | 合格 |
| 8 | AがBを管理→メンバーから削除→確認ダイアログ→削除すると、Bの画面が**自動で**「アクセスできなくなりました」に切り替わり、Aはメンバー1人に戻る | 合格 |
| 9 | 削除されたBが使用済みの同じリンクを開くと「この招待は既に使用されました」で拒否される | 合格 |
| 10 | 「招待リンクを発行して共有」でOSの共有シートが開き、招待文と新しいリンクが共有対象になる。未使用リンクは2本に増える | 合格 |

目視では確認していない(描画テストと2ユーザー通しで代替): 所有権移譲、編集者の退出、招待の取消ボタン、
Free上限到達時の導線、期限切れ・取消済みの表示。

この確認で見つけた不具合は修正済み: 発行直後のリンクが「あと8日」と表示された(画面を開いた時刻で固定した
`now` を使っていたため)。招待の購読が更新されるたびに `now` を取り直す。

#### 再現手順(ローカル)

```bash
# Emulator(別ターミナル)
pnpm --filter functions exec firebase emulators:start --only auth,firestore,functions --project soroe-1850a
# iOS Development Build(初回のみ。ios/ は gitignore 済み)
cd apps/mobile && npx expo prebuild --platform ios   # Podfile.properties.json に "ios.useFrameworks": "static" が必要(下記)
# Metro(Emulatorへ向ける。Simulatorからホストはlocalhost)
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=localhost npx expo start --dev-client --port 8081
# 招待リンクを開く(2台目)
xcrun simctl openurl <udid> "soroe://invite/<token>"
```

ログインは「メールで続ける」。確認コードはFunctions Emulatorのログ(`[ConsoleEmailProvider] OTP for ...`)に出る。

#### iOSビルドで判明した前提(リポジトリには未反映、ENV-002で扱う)

- RN Firebaseを使うため、Podを静的フレームワークにする設定(`ios.useFrameworks: static`、
  `expo-build-properties` など)が要る。未設定だと `pod install` が失敗する。
- Simulator向けでも**署名(ad-hocで可)が要る**。未署名(`CODE_SIGNING_ALLOWED=NO`)だと
  Keychainにアクセスできず、Firebase Authが `17995 keychain` でサインインを保存できない。
- シミュレーターへのキー入力は、日本語入力が有効だとローマ字がかなに変換される。英語キーボードのみに
  設定し、連続入力は1回ずつ待つと確実。

## 4. 観測と注意

- **購読中のリスナーの失効タイミング**: 権限を失った時点で、購読中のリスナーが直ちに終了するわけではない。
  Emulatorでは、削除の直後に変化するメンバー一覧の購読が最初に `permission-denied` になり、
  項目の購読は次の更新(15)が配信される際に終了した。いずれも失効後のデータは配信されなかった。
  このため、リスト詳細画面はメンバー一覧の購読エラーを「アクセスできなくなりました」表示の
  最初の契機として扱っている(`apps/mobile/src/app/list/[listId].tsx`)。
  実Firestoreでの挙動はEmulatorと細部が異なる可能性があるため、実機確認で再度観測する。
- **クライアントのキャッシュ**: 購読中のクエリと同じクエリを `getDocs` / `getDocsFromServer` で
  読むと、SDKが既存の購読結果を返しサーバーへ再問い合わせしないことがある。権限喪失の「新規読取」
  の確認は、購読を持たない別クライアントから行った(スクリプトの手順13)。
- **CIでの通信障害と再試行**: GitHub ActionsのEmulatorで、Firestoreクライアントの購読ストリームが
  `RESOURCE_EXHAUSTED: Received message larger than max`(gRPCフレームのずれ)で切れ、SDKが最大バックオフに
  入って以降の読取が `client is offline`(`unavailable`)になる障害が断続的に起きた(ローカルでは再現せず、
  原因はEmulator/SDKの通信層と見ており未特定)。アサーションの失敗とは別物のため、スクリプトは
  Firestoreクライアントの `unavailable`(offline)のときだけ、新しいクライアントで**1回だけ**全体をやり直す。
  アサーションの失敗は再試行しない。
