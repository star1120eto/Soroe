import { formatInviteExpiry, isInviteActive } from '../inviteExpiry';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 7, 9, 0, 0).getTime();

describe('isInviteActive', () => {
  it('is active until the expiry time and not after', () => {
    expect(isInviteActive({ expiresAt: NOW + 1 }, NOW)).toBe(true);
    expect(isInviteActive({ expiresAt: NOW }, NOW)).toBe(false);
    expect(isInviteActive({ expiresAt: NOW - 1 }, NOW)).toBe(false);
  });
});

describe('formatInviteExpiry', () => {
  it('shows days remaining and the date for a fresh 7-day invite', () => {
    expect(formatInviteExpiry(NOW + 7 * DAY, NOW)).toBe('あと7日(10/14まで)');
  });

  it('rounds a partial day up so the last day still reads あと1日', () => {
    expect(formatInviteExpiry(NOW + 3 * 60 * 60 * 1000, NOW)).toBe('あと1日(10/7まで)');
  });

  it('says 期限切れ once expired', () => {
    expect(formatInviteExpiry(NOW - 1, NOW)).toBe('期限切れ');
  });
});
