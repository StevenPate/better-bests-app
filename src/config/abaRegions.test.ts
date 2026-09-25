import { describe, it, expect } from 'vitest';
import { ABA_REGION_CODES, NON_ABA_REGION_CODES } from './abaRegions';

describe('ABA_REGION_CODES', () => {
  it('covers the nine ABA regions', () => {
    expect(ABA_REGION_CODES).toHaveLength(9);
    expect(ABA_REGION_CODES).toContain('PNBA');
    expect(ABA_REGION_CODES).toContain('CALIBAN');
  });

  it('excludes every non-ABA pseudo-region', () => {
    for (const code of NON_ABA_REGION_CODES) {
      expect(ABA_REGION_CODES).not.toContain(code);
    }
  });

  it('lists IPC as a non-ABA pseudo-region', () => {
    expect(NON_ABA_REGION_CODES).toContain('IPC');
  });
});
