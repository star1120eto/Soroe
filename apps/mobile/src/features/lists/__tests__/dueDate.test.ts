import { formatDueDateInput, parseDueDateInput } from '../dueDate';

describe('parseDueDateInput', () => {
  it('parses a valid date to UTC noon', () => {
    const result = parseDueDateInput('2026-08-10');
    expect(result).toEqual({ ok: true, millis: Date.UTC(2026, 7, 10, 12) });
  });

  it('treats an empty string as "no due date"', () => {
    expect(parseDueDateInput('  ')).toEqual({ ok: true, millis: null });
  });

  it('rejects a malformed string', () => {
    expect(parseDueDateInput('2026/08/10')).toEqual({ ok: false });
    expect(parseDueDateInput('not a date')).toEqual({ ok: false });
  });

  it('rejects a calendar date that does not exist', () => {
    expect(parseDueDateInput('2026-02-30')).toEqual({ ok: false });
  });

  it('accepts a leap day', () => {
    expect(parseDueDateInput('2028-02-29').ok).toBe(true);
  });
});

describe('formatDueDateInput', () => {
  it('formats null as an empty string', () => {
    expect(formatDueDateInput(null)).toBe('');
  });

  it('formats millis back to YYYY-MM-DD using UTC calendar fields', () => {
    expect(formatDueDateInput(Date.UTC(2026, 7, 10, 12))).toBe('2026-08-10');
  });

  it('round-trips through parseDueDateInput', () => {
    const parsed = parseDueDateInput('2026-01-05');
    expect(parsed.ok).toBe(true);
    expect(formatDueDateInput(parsed.ok ? parsed.millis : null)).toBe('2026-01-05');
  });
});
