// src/types/region.test.ts
import { describe, it, expect } from 'vitest';
import { Region, REGION_ABBREVIATIONS, isValidRegion } from './region';

describe('Region Types', () => {
  it('should validate region abbreviation', () => {
    expect(isValidRegion('PNBA')).toBe(true);
    expect(isValidRegion('SIBA')).toBe(true);
    expect(isValidRegion('INVALID')).toBe(false);
  });

  it('should have all required region abbreviations', () => {
    expect(REGION_ABBREVIATIONS).toContain('PNBA');
    expect(REGION_ABBREVIATIONS).toContain('CALIBAN');
    expect(REGION_ABBREVIATIONS).toContain('CALIBAS');
    expect(REGION_ABBREVIATIONS).toContain('GLIBA');
    expect(REGION_ABBREVIATIONS).toContain('MPIBA');
    expect(REGION_ABBREVIATIONS).toContain('MIBA');
    expect(REGION_ABBREVIATIONS).toContain('NAIBA');
    expect(REGION_ABBREVIATIONS).toContain('NEIBA');
    expect(REGION_ABBREVIATIONS).toContain('SIBA');
    expect(REGION_ABBREVIATIONS).toHaveLength(9);
  });
});
