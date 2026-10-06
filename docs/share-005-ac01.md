# SHARE-005 AC-01 コア共有体験の通し確認

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-10-07 |
| 対象 | `soroe-implementation-backlog.md` SHARE-005 / `soroe-functional-specification.md` AC-01 |
| 判定 | **Emulator上の3ユーザー通しは合格(19/19)。実機2台での確認は未実施** |
| 実行環境 | Firebase Emulator(Auth / Firestore / Functions)+ Firebase JS Client SDK |

## 1. 未実施の範囲(要フォロー)

バックログのSHARE-005は「実機2台」での確認を求めているが、Apple Developer Program未登録
(ENV-002、GitHub Issue #6)のためiOS実機ビルドを用意できない。そこで次の代替で確認した。

- 実際のクライアントSDK(アプリと同じRules・Callable Functions・リアルタイム購読の経路)を
  **3ユーザー分**(A: オーナー、B・C: 招待される側)起動し、画面操作を除く全経路を通した。
- 画面(招待画面・共有メンバー画面・リスト詳細の権限喪失表示)は、Emulator上のFirebaseに接続した
  Development Build(Android Emulator 2台、SPIKE-001と同じ構成)で目視確認する必要がある。
  本記録の時点では画面の目視確認は実施していない。

ENV-002の解消後に、実機2台で「作成→招待→受諾→追加→完了→権限喪失」を通し、本書へ追記すること。

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
