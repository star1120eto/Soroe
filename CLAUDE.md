# Soroe 開発ルール

## Pull Requestの作成

コード変更(実装・修正・設定変更など)を伴う作業を終え、ブランチへ
コミット・pushしたら、ユーザーから追加の指示がなくても**必ずPull
Requestを作成する**こと。「PRを作って」と毎回言われるのを待たない。

- 対象ブランチは `main`。
- 既にそのブランチのPRが存在する場合は新規作成せず、追記コミットの
  pushで更新する。
- `.github/pull_request_template.md` 等のPRテンプレートが存在する場合は
  その構成に従って本文を埋める(現時点では未整備)。
- タイトルと本文は変更内容・検証結果(lint/typecheck/test/buildの結果)・
  既知の制約や持ち越し事項が分かるように具体的に書く。
- 調査・質問への回答のみでコード変更を伴わない作業では、PR作成は不要。

## その他

- 実装バックログは `docs/soroe-implementation-backlog.md` を参照する。
- チケットの完了条件・受け入れ条件は `docs/soroe-functional-specification.md`
  の対応セクションを参照する。
