import { toListMember, toUserListRefs } from '../converters';

// converters.tsはFirestoreのTimestamp型を判定に使うだけなので、ネイティブmoduleは差し替える。
jest.mock('@react-native-firebase/firestore', () => {
  class Timestamp {}
  return { __esModule: true, default: { Timestamp } };
});

const validListRef = {
  name: '今週の買い物',
  type: 'shopping',
  color: 'primary',
  icon: 'shopping-cart-simple',
  role: 'owner',
  totalCount: 3,
  completedCount: 1,
  memberCount: 2,
  updatedAt: 1,
  archivedAt: null,
  deletedAt: null,
};

describe('toListMember', () => {
  const base = { role: 'editor', joinedAt: 1 };

  it('keeps a valid display name', () => {
    expect(toListMember('u1', 'list-1', { ...base, displayName: 'はなこ' }).displayName).toBe('はなこ');
  });

  it.each([
    ['missing (members created before names were stored)', undefined],
    ['blank', '   '],
    ['over the 30-character limit', 'あ'.repeat(31)],
    ['not a string', 123],
  ])('falls back to null when the stored name is %s, instead of throwing for everyone viewing the list', (_label, displayName) => {
    expect(toListMember('u1', 'list-1', { ...base, displayName }).displayName).toBeNull();
  });
});

describe('toUserListRefs', () => {
  it('converts every well-formed listRef', () => {
    const refs = toUserListRefs([
      { id: 'a', data: () => validListRef },
      { id: 'b', data: () => ({ ...validListRef, name: '別のリスト' }) },
    ]);

    expect(refs.map((ref) => ref.listId)).toEqual(['a', 'b']);
  });

  it('skips an incomplete listRef instead of breaking the whole list index', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // 集計の書込みだけが残った不完全なドキュメント(name/type/roleが無い)。
    const refs = toUserListRefs([
      { id: 'ghost', data: () => ({ totalCount: 1, completedCount: 0 }) },
      { id: 'good', data: () => validListRef },
    ]);

    expect(refs.map((ref) => ref.listId)).toEqual(['good']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(' ')).toContain('ghost');
    warn.mockRestore();
  });
});
