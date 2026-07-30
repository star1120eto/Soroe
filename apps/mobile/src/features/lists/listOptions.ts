import type { ListType } from '@soroe/shared';

import { Colors, type PhIconName } from '@/design-system';

// LIST-002: リスト作成フォームの選択肢。docs/DesignSystem.pdf 05でバンドル
// されているアイコンの中から種別ごとに固定で1つ選ぶ(専用の「やること」用
// アイコンが無いため、チェックマークで代用する)。
export const LIST_TYPE_OPTIONS: { type: ListType; label: string; icon: PhIconName }[] = [
  { type: 'shopping', label: '買い物', icon: 'shopping-cart-simple' },
  { type: 'packing', label: '持ち物', icon: 'suitcase' },
  { type: 'task', label: 'やること', icon: 'check' },
];

export function iconForListType(type: ListType): PhIconName {
  return LIST_TYPE_OPTIONS.find((option) => option.type === type)?.icon ?? 'tray';
}

// 01カラートークンのうち、リストの目印として使う分だけを選ぶ。
// success/textPrimary等は他の意味(同期成功・本文)で使っているため含めない。
export const LIST_COLOR_OPTIONS: { token: string; label: string; value: string }[] = [
  { token: 'primary', label: 'グリーン', value: Colors.primary },
  { token: 'accent', label: 'オレンジ', value: Colors.accent },
  { token: 'warning', label: 'ゴールド', value: Colors.warning },
  { token: 'danger', label: 'レッド', value: Colors.danger },
];

export function colorValueForToken(token: string): string {
  return LIST_COLOR_OPTIONS.find((option) => option.token === token)?.value ?? Colors.primary;
}

// サーバー側(functions/src/lists/constants.ts)と同じ値。表示専用の目安であり、
// 実際の可否はcreateList Callableが原子的に判定する。
export const FREE_ACTIVE_LIST_LIMIT = 3;
