import { inviteTokenSchema } from '@soroe/shared';

import { buildInviteShareMessage, buildInviteUrl, bytesToHex, generateInviteToken } from '../inviteToken';

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(),
}));

describe('bytesToHex', () => {
  it('encodes each byte as two lowercase hex digits', () => {
    expect(bytesToHex(Uint8Array.from([0, 15, 16, 255]))).toBe('000f10ff');
  });
});

describe('generateInviteToken', () => {
  it('turns 32 random bytes into a 64-character token the server accepts', () => {
    const token = generateInviteToken(() => Uint8Array.from({ length: 32 }, (_, i) => i * 8));

    expect(token).toHaveLength(64);
    expect(inviteTokenSchema.safeParse(token).success).toBe(true);
  });

  it('asks the random source for 256 bits', () => {
    const randomBytes = jest.fn(() => new Uint8Array(32));

    generateInviteToken(randomBytes);

    expect(randomBytes).toHaveBeenCalledWith(32);
  });

  it('uses the platform CSPRNG (expo-crypto) by default', () => {
    const { getRandomBytes } = jest.requireMock('expo-crypto');
    jest.mocked(getRandomBytes).mockReturnValue(new Uint8Array(32).fill(0xab));

    expect(generateInviteToken()).toBe('ab'.repeat(32));
    expect(getRandomBytes).toHaveBeenCalledWith(32);
  });
});

describe('buildInviteUrl', () => {
  it('puts the token in the /invite/ path that the app routes on', () => {
    expect(buildInviteUrl('a'.repeat(64))).toBe(`https://soroe.app/invite/${'a'.repeat(64)}`);
  });
});

describe('buildInviteShareMessage', () => {
  it('names the list and ends with the link', () => {
    const message = buildInviteShareMessage('今週の買い物', 'https://soroe.app/invite/xyz');

    expect(message).toContain('今週の買い物');
    expect(message.endsWith('https://soroe.app/invite/xyz')).toBe(true);
  });
});
