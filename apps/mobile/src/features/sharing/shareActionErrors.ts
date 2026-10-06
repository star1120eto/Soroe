// 招待・メンバー管理のCallable Functionsが投げるHttpsErrorを画面表示用の文言へ
// 変換する。サーバーは日本語の説明を付けて投げるため、理由が分かるcodeでは
// そのメッセージをそのまま見せる。それ以外は生のエラー文を出さず汎用文言にする。
// 招待・メンバー管理はオンライン必須(仕様 4.x オフライン)のため、通信不可は理由を明示する。
const PASSTHROUGH_CODES = new Set(['permission-denied', 'failed-precondition', 'not-found', 'invalid-argument', 'already-exists']);

const FALLBACK_FOR_CODE: Record<string, string> = {
  'permission-denied': 'この操作はオーナーだけが実行できます',
  'failed-precondition': '操作の前提条件を満たしていません',
  'not-found': '対象が見つかりません',
  'invalid-argument': '入力内容を確認してください',
  'already-exists': '時間をおいてもう一度お試しください',
};

export function describeShareActionError(error: unknown): string {
  const err = error as { code?: string; message?: string } | null;
  const code = typeof err?.code === 'string' ? err.code : undefined;

  if (code && PASSTHROUGH_CODES.has(code)) {
    return err?.message || FALLBACK_FOR_CODE[code];
  }
  switch (code) {
    case 'unavailable':
    case 'deadline-exceeded':
      return 'ネットワークに接続できません。招待とメンバー管理はオンラインで操作してください';
    case 'resource-exhausted':
      return 'しばらくしてからもう一度お試しください';
    case 'unauthenticated':
      return 'サインインが必要です。サインインし直してください';
    default:
      return '操作に失敗しました。時間をおいてお試しください';
  }
}
