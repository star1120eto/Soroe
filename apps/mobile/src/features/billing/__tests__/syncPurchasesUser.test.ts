import type { EntitlementGateway } from '../EntitlementGateway';
import { syncPurchasesUser } from '../EntitlementGateway';

const gateway = (configure = true) =>
  ({ configure: jest.fn().mockResolvedValue(configure), logIn: jest.fn().mockResolvedValue({}), logOut: jest.fn().mockResolvedValue(undefined) }) as unknown as jest.Mocked<EntitlementGateway>;

describe('syncPurchasesUser', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('logs in with the firebase uid as App User ID', async () => {
    const g = gateway();
    await syncPurchasesUser(g, 'uid-1');
    expect(g.logIn).toHaveBeenCalledWith('uid-1');
    expect(g.logOut).not.toHaveBeenCalled();
  });
  it('logs out when signed out', async () => {
    const g = gateway();
    await syncPurchasesUser(g, null);
    expect(g.logOut).toHaveBeenCalled();
  });
  it('does nothing when RevenueCat is not configured (no API key)', async () => {
    const g = gateway(false);
    await syncPurchasesUser(g, 'uid-1');
    expect(g.logIn).not.toHaveBeenCalled();
  });
  it('swallows SDK errors so auth is never blocked', async () => {
    const g = gateway();
    g.logIn.mockRejectedValue(new Error('offline'));
    await expect(syncPurchasesUser(g, 'uid-1')).resolves.toBeUndefined();
  });
});
