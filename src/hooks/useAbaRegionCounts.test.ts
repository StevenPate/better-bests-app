import { describe, it, expect, beforeEach, vi } from 'vitest';
import { summarizeAbaRows } from './useAbaRegionCounts';

describe('summarizeAbaRows', () => {
  const row = (isbn: string, region: string, rank: number) => ({ isbn, region, rank });

  it('counts the distinct regions a title charts in', () => {
    const s = summarizeAbaRows([
      row('9781000000001', 'PNBA', 3),
      row('9781000000001', 'SIBA', 7),
      row('9781000000001', 'NEIBA', 2),
    ]);
    expect(s.get('9781000000001')!.regions.size).toBe(3);
  });

  // ABA keeps every list membership, so one title can hold several rows inside
  // a single region (e.g. Children's Titles and Early & Middle Grade).
  it('counts a region once even when the title holds several category slots in it', () => {
    const s = summarizeAbaRows([
      row('9781000000001', 'PNBA', 3),
      row('9781000000001', 'PNBA', 11),
    ]);
    expect(s.get('9781000000001')!.regions.size).toBe(1);
  });

  it('keeps the best rank when a region lists the title more than once', () => {
    const s = summarizeAbaRows([
      row('9781000000001', 'PNBA', 11),
      row('9781000000001', 'PNBA', 3),
    ]);
    expect(s.get('9781000000001')!.rankByRegion.get('PNBA')).toBe(3);
  });

  it('records each region rank separately', () => {
    const s = summarizeAbaRows([
      row('9781000000001', 'PNBA', 3),
      row('9781000000001', 'SIBA', 7),
    ]);
    const entry = s.get('9781000000001')!;
    expect(entry.rankByRegion.get('PNBA')).toBe(3);
    expect(entry.rankByRegion.get('SIBA')).toBe(7);
  });

  it('has no entry for a title that charts nowhere', () => {
    expect(summarizeAbaRows([]).get('9781000000001')).toBeUndefined();
  });

  it('ignores rows with no region or no isbn', () => {
    const s = summarizeAbaRows([
      { isbn: '9781000000001', region: null, rank: 1 },
      { isbn: null, region: 'PNBA', rank: 1 },
      row('9781000000002', 'PNBA', 4),
    ]);
    expect(s.get('9781000000001')).toBeUndefined();
    expect(s.size).toBe(1);
  });
});
