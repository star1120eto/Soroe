#!/usr/bin/env bash
# Soroe v1.0 公開ロードマップの現在地を出す。
#
# 進捗の正はgitのコミット履歴。完了したチケットは
# `<TICKET-ID>: 要約` の書式でコミットされている前提で判定するので、
# 別の進捗ファイルと食い違うことがない。
#
# 使い方: bash .claude/skills/soroe-roadmap/scripts/status.sh

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# STEP|ID|工数|要約
TICKETS='
0|EXT-004|1|OTP送信ドメインの契約とSPF/DKIM/DMARC認証（DNS反映に最大48h。最初に着手）
0|EXT-001|1|App Store Connectにアプリレコード作成、Capabilities設定
0|EXT-002|3|独自ドメインをHostingへ接続、AASA配信、applinks差し替え
0|EXT-003|3|利用規約・プライバシーポリシー・サポートページ公開
0|MAIL-001|3|EmailProviderを実プロバイダへ差し替え、Secret管理
1|LIST-003|7|リスト詳細の購読、高速追加、チェック・再開
1|LIST-004|5|項目編集（数量・単位・カテゴリ・メモ・担当者・期限）と論理削除
1|LIST-006|3|リスト複製、論理削除、30日復元
2|SHARE-001|6|membersと一覧参照、owner/editorのSecurity Rules
2|SHARE-002|7|createInvite/acceptInvite/取消、requestId冪等
2|SHARE-003|4|招待画面、プレビュー、受諾、OS共有シート
2|SHARE-004|5|メンバー削除、招待取消、退出、所有権移譲
2|SHARE-005|2|実機2台で共有フロー検証、AC-01記録
3|OFF-001|4|オフラインBannerと未同期件数
3|OFF-002|4|フィールド単位更新、削除優先、Last Write Wins
3|OFF-003|4|機内モード・2端末同時編集の検証、AC-03記録
4|SET-001|4|設定・プロフィール・日英切替・認証方法・規約
4|DEL-001|7|アカウント削除、7日猶予、Appleトークン失効
4|DEL-002|2|3方式それぞれの削除検証、AC-07記録
5|OBS-001|4|AnalyticsGatewayと主要ファネル、PII非送信テスト
5|OBS-002|3|Crashlyticsのdev/production設定、symbol
6|QA-001|4|Domain/Rules/Functions/UIの不足テスト
6|QA-002|2|最重要E2Eを1本自動化、実機手順書
6|QA-003|4|小/大iPhone、日英、Dynamic Type、VoiceOver
7|REVIEW-001|2|レビュアー用デモアカウント（固定OTP allowlist）
7|REL-003|3|PrivacyInfo.xcprivacy、輸出コンプライアンス、App Privacy回答
7|REL-001|3|production EAS BuildをTestFlightへ配布、観察テスト
8|REL-002a|3|ストア資材（アイコン・スクショ・説明・キーワード）
8|REL-002b|2|審査メモを書いて提出
'

step_name() {
  case "$1" in
    0) echo "外部準備" ;;
    1) echo "リスト" ;;
    2) echo "共有" ;;
    3) echo "オフライン" ;;
    4) echo "設定・削除" ;;
    5) echo "監視" ;;
    6) echo "品質" ;;
    7) echo "TestFlight" ;;
    8) echo "提出" ;;
  esac
}

step_gate() {
  case "$1" in
    0) echo "実ドメインで招待リンクが開き、規約・プライバシー・サポートの3URLが公開され、実機に本物のOTPメールが届く" ;;
    1) echo "3種別のリストを作り、項目を追加・編集・完了・削除・復元でき、4件目が上限で拒否される" ;;
    2) echo "実機2台で「作成→招待→受諾→追加→完了→権限喪失」が通る（AC-01）" ;;
    3) echo "機内モードで操作 → アプリ再起動 → 復帰で別端末へ反映される（AC-03）" ;;
    4) echo "Apple / Google / メールの3方式それぞれで、アプリ内だけで削除が完了する（AC-07）" ;;
    5) echo "production ビルドのクラッシュが symbol 付きで Crashlytics に届く" ;;
    6) echo "P0/P1 不具合0件、CI緑" ;;
    7) echo "説明なしのテスターがコア体験を完走、クラッシュ0件" ;;
    8) echo "提出直前チェックリストが全部埋まる（references/verification.md）" ;;
  esac
}

SUBJECTS="$(git log --format='%s' 2>/dev/null || true)"

is_done() {
  printf '%s\n' "$SUBJECTS" | grep -qE "(^|[[:space:]/,])$1([^0-9A-Za-z-]|$)"
}

bar() { # bar <done> <total>
  local filled=$(( $1 * 10 / $2 )) i out=""
  for ((i = 0; i < 10; i++)); do
    if [ "$i" -lt "$filled" ]; then out="$out#"; else out="$out-"; fi
  done
  printf '%s' "$out"
}

total=0; done_count=0; remaining_hours=0
next_id=""; next_step=""; next_hours=""; next_summary=""
parallel_id=""; parallel_step=""; parallel_hours=""; parallel_summary=""

while IFS='|' read -r step id hours summary; do
  [ -n "${id:-}" ] || continue
  total=$((total + 1))
  if is_done "$id"; then
    done_count=$((done_count + 1))
  else
    remaining_hours=$((remaining_hours + hours))
    if [ -z "$next_id" ]; then
      next_id="$id"; next_step="$step"; next_hours="$hours"; next_summary="$summary"
    fi
    # Step 0 は外部の待ち時間があるため、並行して進められるコードチケットも出す。
    if [ -z "$parallel_id" ] && [ "$step" != "0" ]; then
      parallel_id="$id"; parallel_step="$step"; parallel_hours="$hours"; parallel_summary="$summary"
    fi
  fi
done <<< "$(printf '%s' "$TICKETS" | sed '/^[[:space:]]*$/d')"

echo
echo "Soroe v1.0 App Store 公開ロードマップ — 現在地"
echo "=============================================="
echo

if [ "$total" -gt 0 ]; then
  printf '完了 %d / %d チケット   残り約 %dh（週15hで約%d週 / 週10hで約%d週。20%%バッファ込み）\n' \
    "$done_count" "$total" "$remaining_hours" \
    $(( (remaining_hours * 12 + 149) / 150 )) $(( (remaining_hours * 12 + 99) / 100 ))
fi
echo

for step in 0 1 2 3 4 5 6 7 8; do
  s_total=0; s_done=0
  while IFS='|' read -r st id hours summary; do
    [ -n "${id:-}" ] || continue
    [ "$st" = "$step" ] || continue
    s_total=$((s_total + 1))
    is_done "$id" && s_done=$((s_done + 1))
  done <<< "$(printf '%s' "$TICKETS" | sed '/^[[:space:]]*$/d')"
  [ "$s_total" -gt 0 ] || continue
  printf '  Step %s [%s] %d/%d  %s\n' "$step" "$(bar "$s_done" "$s_total")" "$s_done" "$s_total" "$(step_name "$step")"
done

echo
if [ -z "$next_id" ]; then
  echo "全チケット完了。references/verification.md の提出直前チェックリストを確認して提出する。"
  echo
  exit 0
fi

echo "次のチケット"
echo "------------"
printf '  %s (%sh)  Step %s %s\n' "$next_id" "$next_hours" "$next_step" "$(step_name "$next_step")"
printf '  %s\n' "$next_summary"

if [ -n "$parallel_id" ] && [ "$parallel_id" != "$next_id" ]; then
  echo
  echo "  並行して進められるコードチケット（Step 0 の外部待ちの間に）"
  printf '    %s (%sh)  %s\n' "$parallel_id" "$parallel_hours" "$parallel_summary"
fi

echo
printf 'Step %s のゲート\n' "$next_step"
echo "----------------"
printf '  %s\n' "$(step_gate "$next_step")"

echo
echo "着手前に読む"
echo "------------"
echo "  .claude/skills/soroe-roadmap/references/tickets.md    ← $next_id の行（依存・参照・完了条件）"
echo "  .claude/skills/soroe-roadmap/references/constraints.md ← 関係する不変条件"

dirty="$(git status --porcelain | wc -l | tr -d ' ')"
if [ "$dirty" != "0" ]; then
  echo
  printf '未コミットの変更が %s 件ある。先に片付けるか、着手中のチケットを完了させる。\n' "$dirty"
  git status --short | head -20
fi
echo
