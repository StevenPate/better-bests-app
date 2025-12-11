import { describe, it, expect } from 'vitest';
import { isExactMatch, isRegionSection } from './navigationHelpers';

describe('navigationHelpers', () => {
  describe('isExactMatch', () => {
    it('should return true for exact matches', () => {
      expect(isExactMatch('/elsewhere', '/elsewhere')).toBe(true);
      expect(isExactMatch('/auth', '/auth')).toBe(true);
      expect(isExactMatch('/region/pnba', '/region/pnba')).toBe(true);
    });

    it('should return false for non-exact matches', () => {
      expect(isExactMatch('/elsewhere/foo', '/elsewhere')).toBe(false);
      expect(isExactMatch('/region/pnba/adds', '/region/pnba')).toBe(false);
      expect(isExactMatch('/auth/login', '/auth')).toBe(false);
    });

    it('should return false for substring matches', () => {
      expect(isExactMatch('/elsewhere-extra', '/elsewhere')).toBe(false);
      expect(isExactMatch('/region/pnba-test', '/region/pnba')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isExactMatch('/Elsewhere', '/elsewhere')).toBe(false);
      expect(isExactMatch('/region/PNBA', '/region/pnba')).toBe(false);
    });
  });

  describe('isRegionSection', () => {
    it('should return true for exact region path', () => {
      expect(isRegionSection('/region/pnba', '/region/pnba')).toBe(true);
      expect(isRegionSection('/region/siba', '/region/siba')).toBe(true);
    });

    it('should return true for region sub-routes', () => {
      expect(isRegionSection('/region/pnba/adds', '/region/pnba')).toBe(true);
      expect(isRegionSection('/region/pnba/drops', '/region/pnba')).toBe(true);
      expect(isRegionSection('/region/pnba/adult/adds', '/region/pnba')).toBe(true);
      expect(isRegionSection('/region/pnba/book/9780123456789', '/region/pnba')).toBe(true);
    });

    it('should return false for different regions', () => {
      expect(isRegionSection('/region/siba', '/region/pnba')).toBe(false);
      expect(isRegionSection('/region/siba/adds', '/region/pnba')).toBe(false);
    });

    it('should return false for non-region paths', () => {
      expect(isRegionSection('/elsewhere', '/region/pnba')).toBe(false);
      expect(isRegionSection('/auth', '/region/pnba')).toBe(false);
    });

    it('should return false if regionPath is not a region path', () => {
      expect(isRegionSection('/region/pnba', '/elsewhere')).toBe(false);
      expect(isRegionSection('/anywhere', '/elsewhere')).toBe(false);
    });

    it('should handle edge cases with similar region names', () => {
      // Should not match /region/pnba-test when looking for /region/pnba
      expect(isRegionSection('/region/pnba-test', '/region/pnba')).toBe(false);

      // Should match actual sub-routes
      expect(isRegionSection('/region/pnba/test', '/region/pnba')).toBe(true);
    });

    it('should be case-sensitive', () => {
      expect(isRegionSection('/region/PNBA', '/region/pnba')).toBe(false);
      expect(isRegionSection('/REGION/pnba', '/region/pnba')).toBe(false);
    });

    it('should exclude /elsewhere routes', () => {
      expect(isRegionSection('/region/pnba/elsewhere', '/region/pnba')).toBe(false);
      expect(isRegionSection('/region/siba/elsewhere', '/region/siba')).toBe(false);
    });

    it('should exclude /unique routes', () => {
      expect(isRegionSection('/region/pnba/unique', '/region/pnba')).toBe(false);
      expect(isRegionSection('/region/siba/unique', '/region/siba')).toBe(false);
    });
  });
});
