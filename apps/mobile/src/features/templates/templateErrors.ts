// saveMyTemplate / createListFromTemplate のHttpsErrorを画面表示用の日本語へ変換する。
// 上限は、保存(マイテンプレート1件)と作成(リスト3件)で文言が違う。
export function describeTemplateError(error: unknown, context: 'save' | 'create'): string {
  const err = error as { code?: string; message?: string } | null;
  switch (err?.code) {
    case 'resource-exhausted':
      return context === 'save'
        ? 'Freeプランで保存できるマイテンプレートは1件までです'
        : 'Freeプランで利用できるリストは3件までです';
    case 'not-found':
      return 'テンプレートが見つかりません';
    case 'invalid-argument':
      // サーバーが具体的な理由(項目がない等)を設定しているため、そのまま表示する。
      return err.message || '入力内容を確認してください';
    default:
      return '操作に失敗しました。時間をおいてお試しください';
  }
}
