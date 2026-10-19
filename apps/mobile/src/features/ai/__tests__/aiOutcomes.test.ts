import { getOutcome, subscribeToOutcome, trackGeneration } from '../aiOutcomes';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('aiOutcomes', () => {
  it('stores the response once the generation call resolves', async () => {
    trackGeneration('r1', Promise.resolve({ status: 'busy' }));
    expect(getOutcome('r1')).toBeNull();

    await flush();

    expect(getOutcome('r1')).toEqual({ kind: 'response', response: { status: 'busy' } });
  });

  it('stores the error when the call fails', async () => {
    const error = new Error('offline');
    trackGeneration('r2', Promise.reject(error));
    await flush();

    expect(getOutcome('r2')).toEqual({ kind: 'error', error });
  });

  it('notifies a listener now if the outcome is already known, and later otherwise', async () => {
    let resolve!: (value: { status: 'cancelled' }) => void;
    trackGeneration('r3', new Promise((res) => (resolve = res)));
    const listener = jest.fn();

    const unsubscribe = subscribeToOutcome('r3', listener);
    expect(listener).not.toHaveBeenCalled();
    resolve({ status: 'cancelled' });
    await flush();
    expect(listener).toHaveBeenCalledWith({ kind: 'response', response: { status: 'cancelled' } });

    const late = jest.fn();
    subscribeToOutcome('r3', late);
    expect(late).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('does not notify after unsubscribing', async () => {
    let resolve!: (value: { status: 'busy' }) => void;
    trackGeneration('r4', new Promise((res) => (resolve = res)));
    const listener = jest.fn();

    subscribeToOutcome('r4', listener)();
    resolve({ status: 'busy' });
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });
});
