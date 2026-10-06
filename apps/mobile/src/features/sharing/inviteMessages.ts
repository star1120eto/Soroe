import type { InviteUnavailableStatus } from '@soroe/shared';

// 招待を使えない理由(プレビュー・受諾で共通)に、受諾の結果として画面に出す
// 「自分の招待」「上限到達」を加えたもの。仕様SHARE-02の例外と上限時の表示に対応する。
export type InviteProblem = InviteUnavailableStatus | 'own-invite' | 'limit-reached';

const REQUEST_NEW_LINK = '招待した人に、新しいリンクの送信を依頼してください。';

const MESSAGES: Record<InviteProblem, { title: string; description: string }> = {
  expired: { title: '招待の有効期限が切れています', description: REQUEST_NEW_LINK },
  revoked: { title: 'この招待は取り消されました', description: REQUEST_NEW_LINK },
  used: {
    title: 'この招待は既に使用されました',
    description: `招待リンクは1人に1回だけ使えます。${REQUEST_NEW_LINK}`,
  },
  'list-deleted': {
    title: 'このリストは削除されました',
    description: '参加できません。招待した人に確認してください。',
  },
  'list-archived': {
    title: 'このリストはアーカイブ中です',
    description: '招待した人がアーカイブを解除すると参加できます。',
  },
  'not-found': {
    title: '招待が見つかりません',
    description: `リンクが正しいか確認するか、${REQUEST_NEW_LINK}`,
  },
  'own-invite': {
    title: '自分が作成した招待です',
    description: '家族にリンクを送って、参加してもらいましょう。',
  },
  'limit-reached': {
    title: 'Freeプランのリスト上限に達しています',
    description: '参加するには、既存のリストをアーカイブしてから、もう一度招待リンクを開いてください。',
  },
};

export function describeInviteProblem(problem: InviteProblem): { title: string; description: string } {
  return MESSAGES[problem];
}
