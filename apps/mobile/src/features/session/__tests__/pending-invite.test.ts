import {
  clearPendingInviteToken,
  readPendingInviteToken,
  savePendingInviteToken,
} from '../pending-invite';

describe('pending invite token storage', () => {
  it('round-trips save, read, and clear', async () => {
    expect(await readPendingInviteToken()).toBeNull();

    await savePendingInviteToken('abc123');
    expect(await readPendingInviteToken()).toBe('abc123');

    await clearPendingInviteToken();
    expect(await readPendingInviteToken()).toBeNull();
  });
});
