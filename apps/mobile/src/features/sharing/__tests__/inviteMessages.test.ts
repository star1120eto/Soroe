import { describeInviteProblem, type InviteProblem } from '../inviteMessages';

const ALL_PROBLEMS: InviteProblem[] = [
  'expired',
  'revoked',
  'list-deleted',
  'list-archived',
  'not-found',
  'own-invite',
  'limit-reached',
];

describe('describeInviteProblem', () => {
  it.each(ALL_PROBLEMS)('gives %s a title and a next step', (problem) => {
    const { title, description } = describeInviteProblem(problem);

    expect(title.length).toBeGreaterThan(0);
    expect(description.length).toBeGreaterThan(0);
  });

  it('tells the user to ask for a new link when the invite expired or was revoked', () => {
    expect(describeInviteProblem('expired').description).toContain('新しいリンク');
    expect(describeInviteProblem('revoked').description).toContain('新しいリンク');
  });

  it('explains the Free limit and the way out (archive an existing list)', () => {
    const { title, description } = describeInviteProblem('limit-reached');

    expect(title).toContain('上限');
    expect(description).toContain('アーカイブ');
  });

  it('distinguishes the inviter opening their own link', () => {
    expect(describeInviteProblem('own-invite').title).toContain('自分');
  });
});
