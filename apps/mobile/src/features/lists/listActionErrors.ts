// LIST-006: archiveList/deleteList/unarchiveList/restoreList/duplicateListの
// Callable Functionsが投げるHttpsErrorを画面表示用の日本語文言へ変換する。
export function describeListActionError(error: unknown): string {
  const err = error as { code?: string; message?: string } | null;
  switch (err?.code) {
    case 'resource-exhausted':
      return 'Freeプランで利用できるリストは3件までです';
    case 'permission-denied':
      return 'オーナーだけが実行できます';
    case 'not-found':
      return 'リストが見つかりません';
    case 'failed-precondition':
      // failed-preconditionはrestoreListの「30日経過」とarchiveListの
      // 「既に削除済み」の両方で使うため、汎用文言ではなくサーバーが
      // 設定した具体的なメッセージをそのまま表示する。
      return err.message || '操作の前提条件を満たしていません';
    default:
      return '操作に失敗しました。時間をおいてお試しください';
  }
}
