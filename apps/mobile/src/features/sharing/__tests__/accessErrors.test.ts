import { isAccessDeniedError } from '../accessErrors';

describe('isAccessDeniedError', () => {
  it.each(['firestore/permission-denied', 'permission-denied'])(
    'recognises %s (a member who was removed while subscribed)',
    (code) => {
      expect(isAccessDeniedError({ code })).toBe(true);
    }
  );

  it.each([{ code: 'firestore/unavailable' }, { code: 'firestore/not-found' }, new Error('boom'), null, undefined, 'x'])(
    'does not treat %j as access loss',
    (error) => {
      expect(isAccessDeniedError(error)).toBe(false);
    }
  );
});
