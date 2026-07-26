# SPIKE-001 オフライン同期PoC 結果

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-07-26 |
| 対象 | `soroe-implementation-backlog.md` SPIKE-001 / `soroe-technology-stack-evaluation.md` STACK-GATE-01 |
| 判定 | **合格**。React Native Firebase + Cloud Firestore の採用を継続する |
| 実行環境 | Android Emulator 2台(Pixel_10 / Pixel_10_B、API 37、arm64)+ Firestore/Auth Emulator |

## 1. 判定

STACK-GATE-01の合格条件をすべて満たした。恒常的な patch-package や fork、
手作業の native 差分は不要だった。Flutter等への比較PoCは行わない。

## 2. 検証結果

| # | 検証項目 | 結果 | 観測した事実 |
|---|---|---|---|
| 1 | Aの追加がBへリアルタイム反映 | 合格 | A で `MilkFromA` を追加 → 数秒でBに出現(`items: 1`) |
| 2 | オフライン書込がプロセス終了を跨いで残る | 合格 | 機内モード中にBで追加 → 即ローカル反映(`pendingWrites: true`)。プロセス強制終了後もデバイス上のSQLiteに未同期mutationが残存 |
| 3 | オンライン復帰後にAへ同期 | 合格 | B復帰後、Aに `EggsFromB_Offline` が到達(`items: 2`、`pendingWrites: false`) |
| 4 | 同一項目の競合(LWW) | 合格 | 両端末をオフラインにして同じ項目名を別値へ変更 → 後着側の値に**両端末が収束** |
| 5 | 別項目の同時編集 | 合格 | 別々の項目を同時編集 → **両方の変更が保持**され、片方が失われない |
| 6 | soft deleteの健全性 | 合格 | 論理削除後、一覧からは消えるがドキュメントは `deletedAt` を持って物理的に残存。復元不能な破損なし |

### 検証2の裏付け

アプリのプロセスを強制終了した状態で、Firestoreのローカル永続化DBを
直接検査した。

```
$ sqlite3 <取り出したDB> "select count(*) from mutations;"
1

$ sqlite3 <取り出したDB> "select path from document_mutations;"
lists^A^Aspike-001^A^Aitems^A^AWFlmPU3NxjYSTktEz6nI^A^A
```

mutation本体にも対象パスと `EggsFromB_Offline` が含まれており、未同期の
書込がディスクに永続化されていることを確認した。

### 検証6の裏付け

Admin SDK(Rules迂回)で実データを確認した。

```
name="MilkFromA*05.164*05.120" deletedAt=null
name="EggsFromB_Offline*07.819" deletedAt=SET
total docs (物理的に残っている件数)=2
```

## 3. 判明した制約と対処

### dev clientは機内モードのままでは再起動できない

Development Build は起動時に Metro から JS バンドルを取得するため、機内モード中に
アプリを再起動すると `java.net.ConnectException: Failed to connect to /10.0.2.2:8081`
で起動できない。これはアプリの不具合ではなく検証手順側の制約。

このため検証2では「再起動して画面に残ることを目視する」代わりに、
プロセス終了後のローカル永続化DBを直接検査する方法をとった。永続化の
確認としてはむしろ直接的である。Release相当ビルドではバンドルが同梱される
ため、この制約は本番では発生しない。

### Emulatorを使ったことによる検証範囲の限界

Firestore Emulator は複合インデックスを強制しないため、インデックス不足は
本検証では検出できない。`firestore.indexes.json` に定義したインデックスの
妥当性は、本番へのデプロイ(`firebase deploy --only firestore:indexes`)で
別途確認する必要がある。

## 4. 再現手順

```bash
# 1. Emulator(Firestore + Auth)を起動
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:start --only auth,firestore

# 2. apps/mobile/.env.local で Emulator へ向ける
#    Android Emulatorからホストを見るには10.0.2.2
#    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2

# 3. Android Emulator 2台を起動し、Development Buildを入れてMetroへ接続
#    アプリ内で soroe://dev/offline-sync を開く

# 4. 両端末のuidを控えてシード(リスト作成とメンバー登録)
#    createList/招待はLIST-002/SHARE-001のスコープで未実装のため、
#    検証準備としてAdmin SDKでRulesを迂回して直接書き込む
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=soroe-1850a \
  node scripts/seed-spike-001.mjs <uidA> <uidB>
```

機内モードの切替は `adb -s <device> shell cmd connectivity airplane-mode enable|disable`。

## 5. 次の作業への引き継ぎ

- `hasPendingWrites` / `fromCache` をそのまま OFF-001(オフラインBannerと未同期件数)の
  判定に使える。`subscribeToListItems` が両方を返すようにしてある
- 同一項目の競合はLWWで収束するため、ITEM-01の「保存時に競合確認を表示する」は
  更新時刻の比較で自前に実装する必要がある(Firestore側は競合を検出しない)
- 検証用画面 `src/app/dev/offline-sync.tsx` とシード `functions/scripts/seed-spike-001.mjs`
  は、今後の同期系タスクの回帰確認に再利用できる
