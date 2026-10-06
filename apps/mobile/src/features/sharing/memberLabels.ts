import type { ListMember, ListRole } from '@soroe/shared';

const ROLE_LABEL: Record<ListRole, string> = {
  owner: 'オーナー',
  editor: '編集者',
};

export function roleLabel(role: ListRole): string {
  return ROLE_LABEL[role];
}

// 表示名は参加時点でmemberへ非正規化している。SHARE-001以前に作られた
// memberには無いため、役割ベースの名前へフォールバックする。
function baseName(member: ListMember): string {
  return member.displayName ?? (member.role === 'owner' ? 'オーナー' : 'メンバー');
}

export function memberDisplayName(member: ListMember, selfUid: string): string {
  const name = baseName(member);
  return member.uid === selfUid ? `${name}(自分)` : name;
}

/** 担当者フィルターのチップ用。自分は「自分」、他のメンバーは名前。 */
export function assigneeChipLabel(member: ListMember, selfUid: string): string {
  return member.uid === selfUid ? '自分' : baseName(member);
}

/** オーナーを先頭に、残りは参加が早い順。 */
export function sortMembers(members: ListMember[]): ListMember[] {
  return [...members].sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === 'owner' ? -1 : 1;
    }
    return a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid);
  });
}
