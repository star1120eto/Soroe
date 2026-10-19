# OFF-003 / AC-03 オフライン 確認記録

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-10-19 |
| 対象 | `soroe-implementation-backlog.md` OFF-001〜003 / `soroe-functional-specification.md` OFFLINE-01・SYNC-01・AC-03 |
| 判定 | **Emulator上の通し(6/6)は合格。iPhone実機・シミュレーター2台での機内モード確認は未実施** |

## 1. 確認方法と未実施の範囲

実機はApple Developer Program未登録(ENV-002、Issue #6)のため使えない。代わりに、アプリが使うのと同じ
Firestoreのクライアントを2ユーザー分起動し、`disableNetwork()` / `enableNetwork()` で機内モードを再現して
通した(`apps/mobile/scripts/e2e-offline-ac03.mjs`、CIの `e2e:offline`)。

- 実行: `pnpm run build:shared && pnpm run build:functions` のあと
  `firebase emulators:exec --only auth,firestore,functions 'pnpm --filter mobile run e2e:offline'`
  (ホストにJavaが要る。Homebrewのopenjdkは `PATH=/opt/homebrew/opt/openjdk/bin:$PATH` を通す)。
- 未実施: 実機・シミュレーターでの機内モード、画面上の帯・件数・競合ダイアログの目視(ユニットテストと
  画面テストで挙動は確認済み)。

## 2. 結果(Emulator)

| # | 確認 | 結果 |
|---|---|---|
| 1 | 準備: AがリストをつくりBを招待、Bが参加する | 合格 |
| 2 | オフラインの追加・編集・完了・削除が即座にローカルへ反映され、未同期(`hasPendingWrites`)になる。復帰前はBに届かない | 合格 |
| 3 | 復帰後に自動で同期され、別のクライアントへ届く(AC-03 ①〜③) | 合格 |
| 4 | 別の項目を同時にオフラインで変更しても、両方残る | 合格 |
| 5 | 同じ項目の別フィールドを同時に変更しても両方残る。同じフィールドは後に届いた値へ収束する | 合格 |
| 6 | 削除と編集が競合したら削除が優先される | 合格 |

## 3. 観測と注意

- **通信の乱れによる再試行**: Node版のgRPCは、接続を切り替えた直後に壊れて以降の受信が止まることがある
  (`RESOURCE_EXHAUSTED: Received message larger than max`)。既存のe2e(`e2e:share`)でも出た現象で、
  アプリの不具合ではない。このスクリプトは、この乱れが検出された失敗に限り、新しいクライアントで
  全体をやり直す(最大4回)。8回の連続実行では、1回あたり約1/3の確率で乱れが出た。
- **検知の遅れ**: オフラインの判定は `users/{uid}` の購読の `fromCache` が3秒続いたときで、機内モードに
  してから帯が出るまで数秒かかる(NetInfoを足さない方針の欠点)。
- **競合の扱い**: 画面の保存は、利用者が変えた項目だけを書く。同じ項目の別フィールドの同時変更は両方残る。
  同じフィールドの食い違いは、画面(ItemEdit)が編集中に検出したときだけ比較を出す。画面を開いていない
  間の同時変更は、サーバー側が後に届いた値を採用する(Last Write Wins)。
- **削除優先**: 削除済みの項目への編集は書込として通るが、`deletedAt` を変えないため一覧には戻らない。
