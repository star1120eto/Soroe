import { getOrCreateDeviceId } from '../device-id';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'generated-uuid'),
}));

describe('getOrCreateDeviceId', () => {
  it('generates an id on first call and reuses it afterwards', async () => {
    const first = await getOrCreateDeviceId();
    expect(first).toBe('generated-uuid');

    const { randomUUID } = jest.requireMock('expo-crypto');
    jest.mocked(randomUUID).mockReturnValue('different-uuid');

    const second = await getOrCreateDeviceId();
    expect(second).toBe('generated-uuid');
  });
});
