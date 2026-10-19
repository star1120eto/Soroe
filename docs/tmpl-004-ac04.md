# TMPL-004 / AC-04 テンプレート 確認記録

| 項目 | 内容 |
|---|---|
| 実施日 | 2026-10-20 |
| 対象 | `soroe-implementation-backlog.md` TMPL-001〜004 / `soroe-functional-specification.md` 7章・AC-04 |
| 判定 | **Emulator上の通し(9/9)は合格。画面(iPhone実機・シミュレーター・ブラウザ)での目視は未実施** |

## 1. 確認方法と未実施の範囲

実機はApple Developer Program未登録(ENV-002、Issue #6)のため使えない。代わりに、アプリが使うのと同じ
Firebase Client SDK(Rules・Callable Functions)で1ユーザーの通しを行った
(`apps/mobile/scripts/e2e-templates-ac04.mjs`、CIの `e2e:templates`)。

- 実行: `pnpm run build:shared && pnpm run build:functions` のあと
  `firebase emulators:exec --only auth,firestore,functions 'pnpm run templates:seed && pnpm --filter mobile run e2e:templates'`
  (ホストにJavaが要る。Homebrewのopenjdkは `PATH=/opt/homebrew/opt/openjdk/bin:$PATH` を通す)。
- サーバー処理は、Emulatorの統合テスト(`functions/src/integration/templateStore.integration.test.ts`、18件)で
  保存・作成・上限・冪等・独立性・500項目超の分割も確認している。画面はユニット・画面テストで確認した。
- 未実施: 画面での目視(テンプレートタブ、詳細、保存、マイの管理)、Premiumでの上限解除(課金は EPIC-08)。

## 2. 結果(Emulator、通し 9/9)

| # | 確認 | 結果 |
|---|---|---|
| 1 | 公開済みの公式テンプレート10件と、day-hikeの項目を読める | 合格 |
| 2 | 公式テンプレートから不要項目(地図)を除いて作成できる。人数補正は人数ごとの項目だけ(AC-04 ①) | 合格 |
| 3 | リストをマイテンプレートに保存できる。担当者・完了者・作成者は保存されず、完了状態は初期チェックとして残る(AC-04 ②) | 合格 |
| 4 | Freeの2件目の保存は上限(`resource-exhausted`)になる(AC-04 ③) | 合格 |
| 5 | 保存後に元のリストを変更・削除しても、保存済みの内容は変わらない(AC-04 ④) | 合格 |
| 6 | マイテンプレートからリストを作成できる(初期チェック状態も引き継ぐ) | 合格 |
| 7 | 元の公式テンプレートを後から変更しても、作成済みのリストは変わらない | 合格 |
| 8 | Rules: マイテンプレートの直接作成と、項目を増やす更新は拒否。名前変更・項目を減らす更新は通る | 合格 |
| 9 | Freeのリスト上限(3件)を超える作成は拒否される | 合格 |

3回連続で実行し、いずれも通過した(通信の乱れによる再試行は発生しなかった)。

## 3. 初期の公式テンプレート(10件、日英。内容のレビュー用)

| id | カテゴリ | 種別 | 名称(日 / 英) | 項目数 | 補正 | 安全注意 |
|---|---|---|---|---:|---|---|
| `camping` | outdoor | packing | キャンプ / Camping | 14 | 人数補正 | - |
| `day-hike` | outdoor | packing | 日帰り登山 / Day hike | 12 | 人数補正 | あり |
| `disaster-kit` | home | packing | 防災用品 / Disaster kit | 14 | 人数補正 | あり |
| `hometown-visit` | family-trip | packing | 帰省の持ち物 / Visiting family | 11 | - | - |
| `household-restock` | shopping | shopping | 日用品の補充 / Household restock | 11 | - | - |
| `moving-checklist` | home | task | 引っ越しのやること / Moving checklist | 12 | - | - |
| `overnight-trip-kids` | family-trip | packing | 子連れ1泊2日の旅行 / Overnight trip with kids | 14 | 人数補正 | - |
| `park-picnic` | outing | packing | 公園・ピクニック / Park and picnic | 11 | 人数補正 | - |
| `school-excursion` | school | packing | 遠足の持ち物 / School excursion | 11 | - | - |
| `weekly-groceries` | shopping | shopping | 1週間分の食材 / Weekly groceries | 14 | 人数補正 | - |

内容は `functions/data/official-templates/*.json`。追加は、JSONを足して `pnpm run templates:validate` で検証し、
`pnpm run templates:seed`(Emulator)で反映する。20〜30件への拡張は内容の追加だけでできる。
本番への反映手順(デプロイ時のseed)は、デプロイ手順を決める際に別途用意する。

## 4. 観測と注意

- **一覧の取得**: 公式テンプレートの一覧は、`published == true` で絞ったクエリに限り読める(Rules)。
  アプリの購読も同じ。複合インデックスを避けるため、並び替え(優先度)はクライアントで行う。
- **リスト作成の冪等性**: 項目は transaction の外で分割して書くため、作成直後に項目の書込が失敗した場合は、
  同じ `requestId` の再送でも項目は補われない(既存の `duplicateList` と同じ既知の制約)。
- **Premium失効後の選択**: 「使う1件を選ぶ」画面とロック表示は課金(EPIC-08)と合わせて実装する。
