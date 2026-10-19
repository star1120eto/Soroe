import { clearPendingAiRequest, readPendingAiRequest, savePendingAiRequest } from '../pendingAiRequest';

describe('pending AI request storage', () => {
  it('round-trips save, read and clear', async () => {
    expect(await readPendingAiRequest()).toBeNull();

    await savePendingAiRequest('req-1');
    expect(await readPendingAiRequest()).toBe('req-1');

    await clearPendingAiRequest();
    expect(await readPendingAiRequest()).toBeNull();
  });
});
