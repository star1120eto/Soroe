import { describeShareActionError } from '../shareActionErrors';

describe('describeShareActionError', () => {
  it.each(['permission-denied', 'failed-precondition', 'not-found', 'invalid-argument', 'already-exists'])(
    'shows the server-provided Japanese message for %s',
    (code) => {
      expect(describeShareActionError({ code, message: 'サーバーからの説明' })).toBe('サーバーからの説明');
    }
  );

  it('falls back to a generic explanation when the server gave no message', () => {
    expect(describeShareActionError({ code: 'permission-denied' })).toContain('オーナー');
    expect(describeShareActionError({ code: 'failed-precondition' })).not.toBe('');
  });

  it('explains that sharing needs a connection when the network is unavailable', () => {
    for (const code of ['unavailable', 'deadline-exceeded']) {
      const text = describeShareActionError({ code, message: 'raw network error' });
      expect(text).toContain('オンライン');
      expect(text).not.toContain('raw network error');
    }
  });

  it('asks the user to wait when rate limited', () => {
    expect(describeShareActionError({ code: 'resource-exhausted' })).toContain('しばらく');
  });

  it('asks the user to sign in when the session is gone', () => {
    expect(describeShareActionError({ code: 'unauthenticated' })).toContain('サインイン');
  });

  it('never leaks raw error text for unknown failures', () => {
    const text = describeShareActionError(new Error('ECONNRESET at socket.js:42'));

    expect(text).not.toContain('ECONNRESET');
    expect(text.length).toBeGreaterThan(0);
  });

  it('tolerates null and non-error values', () => {
    expect(describeShareActionError(null).length).toBeGreaterThan(0);
    expect(describeShareActionError('oops').length).toBeGreaterThan(0);
  });
});
