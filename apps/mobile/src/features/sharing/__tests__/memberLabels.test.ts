import type { ListMember } from '@soroe/shared';

import { assigneeChipLabel, memberDisplayName, roleLabel, sortMembers } from '../memberLabels';

function member(overrides: Partial<ListMember> & Pick<ListMember, 'uid'>): ListMember {
  return { listId: 'list-1', role: 'editor', joinedAt: 1, displayName: null, ...overrides };
}

describe('roleLabel', () => {
  it('uses the product wording for roles', () => {
    expect(roleLabel('owner')).toBe('オーナー');
    expect(roleLabel('editor')).toBe('編集者');
  });
});

describe('memberDisplayName', () => {
  it('uses the stored display name', () => {
    expect(memberDisplayName(member({ uid: 'u2', displayName: 'はなこ' }), 'u1')).toBe('はなこ');
  });

  it('marks the signed-in user', () => {
    expect(memberDisplayName(member({ uid: 'u1', displayName: 'たろう' }), 'u1')).toBe('たろう(自分)');
  });

  it('falls back to a role-based label for members created before names were stored', () => {
    expect(memberDisplayName(member({ uid: 'u2', role: 'owner' }), 'u1')).toBe('オーナー');
    expect(memberDisplayName(member({ uid: 'u3' }), 'u1')).toBe('メンバー');
  });
});

describe('assigneeChipLabel', () => {
  it('is 自分 for the signed-in user and the name for others', () => {
    expect(assigneeChipLabel(member({ uid: 'u1', displayName: 'たろう' }), 'u1')).toBe('自分');
    expect(assigneeChipLabel(member({ uid: 'u2', displayName: 'はなこ' }), 'u1')).toBe('はなこ');
    expect(assigneeChipLabel(member({ uid: 'u3' }), 'u1')).toBe('メンバー');
  });
});

describe('sortMembers', () => {
  it('lists the owner first, then the others by join time', () => {
    const sorted = sortMembers([
      member({ uid: 'late', joinedAt: 30 }),
      member({ uid: 'owner', role: 'owner', joinedAt: 50 }),
      member({ uid: 'early', joinedAt: 10 }),
    ]);

    expect(sorted.map((m) => m.uid)).toEqual(['owner', 'early', 'late']);
  });

  it('does not mutate its input', () => {
    const input = [member({ uid: 'b', joinedAt: 2 }), member({ uid: 'a', joinedAt: 1 })];

    sortMembers(input);

    expect(input.map((m) => m.uid)).toEqual(['b', 'a']);
  });
});
