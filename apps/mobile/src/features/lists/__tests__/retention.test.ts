import { daysRemainingUntilPurge } from '../retention';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('daysRemainingUntilPurge', () => {
  it('returns 30 right after deletion', () => {
    expect(daysRemainingUntilPurge(0, 0)).toBe(30);
  });

  it('counts down as days pass', () => {
    expect(daysRemainingUntilPurge(0, 5 * DAY_MS)).toBe(25);
  });

  it('never goes below zero once the window has passed', () => {
    expect(daysRemainingUntilPurge(0, 31 * DAY_MS)).toBe(0);
    expect(daysRemainingUntilPurge(0, 100 * DAY_MS)).toBe(0);
  });
});
