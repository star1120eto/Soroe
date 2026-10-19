import { act, renderHook } from '@testing-library/react-native';

import { useDelayedFlag } from './useDelayedFlag';

describe('useDelayedFlag', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('trueがdelay未満で終われば、一度もtrueを返さない', async () => {
    const { result, rerender } = await renderHook(({ flag }: { flag: boolean }) => useDelayedFlag(flag, 800), {
      initialProps: { flag: true },
    });
    expect(result.current).toBe(false);
    await act(async () => jest.advanceTimersByTime(500));
    expect(result.current).toBe(false);
    await rerender({ flag: false });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('trueがdelay以上続けばtrueを返し、falseになれば即座に戻す', async () => {
    const { result, rerender } = await renderHook(({ flag }: { flag: boolean }) => useDelayedFlag(flag, 800), {
      initialProps: { flag: true },
    });
    await act(async () => jest.advanceTimersByTime(800));
    expect(result.current).toBe(true);
    await rerender({ flag: false });
    expect(result.current).toBe(false);
  });
});
