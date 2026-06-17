import { describe, it, expect } from 'vitest';
import { wednesdayFromSundayWeekEnd } from './utils';

describe('wednesdayFromSundayWeekEnd', () => {
  it('maps a Sunday list date to the following Wednesday (publication day)', () => {
    expect(wednesdayFromSundayWeekEnd('June 14, 2026')).toBe('2026-06-17');
    expect(wednesdayFromSundayWeekEnd('June 7, 2026')).toBe('2026-06-10');
    expect(wednesdayFromSundayWeekEnd('May 31, 2026')).toBe('2026-06-03');
  });

  it('handles year boundary', () => {
    expect(wednesdayFromSundayWeekEnd('December 28, 2025')).toBe('2025-12-31');
  });

  it('returns null on unparseable input', () => {
    expect(wednesdayFromSundayWeekEnd('not a date')).toBeNull();
    expect(wednesdayFromSundayWeekEnd('')).toBeNull();
  });
});
