// LIST-006: archiveList/deleteList/unarchiveList/restoreList/duplicateListの
// Callable Functionsが投げるHttpsErrorのcodeを画面表示用の日本語文言へ変換する。
export function describeListActionError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case 'resource-exhausted':
      return 'Freeプランで利用できるリストは3件までです';
    case 'permission-denied':
      return 'オーナーだけが実行できます';
    case 'not-found':
      return 'リストが見つかりません';
    case 'failed-precondition':
      return '削除から30日を過ぎたリストは復元できません';
    default:
      return '操作に失敗しました。時間をおいてお試しください';
  }
}
