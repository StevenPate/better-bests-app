// src/config/regions.test.ts
import { describe, it, expect } from 'vitest';
import { REGIONS, DEFAULT_REGION, getRegionByAbbreviation, getRegionByFileCode } from './regions';

describe('Region Configuration', () => {
  it('should have exactly 8 configured regions', () => {
    expect(REGIONS).toHaveLength(8);
  });

  it('should default to PNBA', () => {
    expect(DEFAULT_REGION).toBe('PNBA');
  });

  it('should find region by abbreviation', () => {
    const pnba = getRegionByAbbreviation('PNBA');
    expect(pnba?.full_name).toBe('Pacific Northwest Booksellers Association');
    expect(pnba?.file_code).toBe('pn');
  });

  it('should find region by file code', () => {
    const pnba = getRegionByFileCode('pn');
    expect(pnba?.abbreviation).toBe('PNBA');
  });

  it('should return null for invalid abbreviation', () => {
    expect(getRegionByAbbreviation('INVALID')).toBeNull();
  });

  it('should have all regions active at launch', () => {
    REGIONS.forEach(region => {
      expect(region.is_active).toBe(true);
    });
  });

  it('should have unique display orders', () => {
    const orders = REGIONS.map(r => r.display_order);
    const uniqueOrders = new Set(orders);
    expect(uniqueOrders.size).toBe(REGIONS.length);
  });

  it('should have valid website URLs for all regions', () => {
    REGIONS.forEach(region => {
      expect(region.website_url).toBeTruthy();
      expect(region.website_url).toMatch(/^https:\/\//);
    });
  });
});
