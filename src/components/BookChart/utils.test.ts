// src/components/BookChart/utils.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRankColor, calculateRegionalStats, generateWeekDates } from './utils';
import type { RegionalWeekData } from './types';

describe('BookChart utils', () => {
  describe('getRankColor', () => {
    it('should return dark green for ranks 1-5', () => {
      expect(getRankColor(1)).toBe('bg-emerald-700');
      expect(getRankColor(5)).toBe('bg-emerald-700');
    });

    it('should return medium green for ranks 6-10', () => {
      expect(getRankColor(6)).toBe('bg-emerald-500');
      expect(getRankColor(10)).toBe('bg-emerald-500');
    });

    it('should return light green for ranks 11-20', () => {
      expect(getRankColor(11)).toBe('bg-emerald-300');
      expect(getRankColor(20)).toBe('bg-emerald-300');
    });

    it('should return muted for ranks > 20', () => {
      expect(getRankColor(21)).toBe('bg-muted');
      expect(getRankColor(100)).toBe('bg-muted');
    });

    it('should return muted for null rank', () => {
      expect(getRankColor(null)).toBe('bg-muted');
    });
  });

  describe('calculateRegionalStats', () => {
    it('should calculate stats from regional week data', () => {
      const weekData: RegionalWeekData[] = [
        { region: 'PNBA', weekDate: '2025-01-01', rank: 3, category: 'Fiction', listTitle: 'Fiction' },
        { region: 'PNBA', weekDate: '2025-01-08', rank: 1, category: 'Fiction', listTitle: 'Fiction' },
        { region: 'PNBA', weekDate: '2025-01-15', rank: 5, category: 'Fiction', listTitle: 'Fiction' },
      ];

      const stats = calculateRegionalStats(weekData);

      expect(stats.weeksOnList).toBe(3);
      expect(stats.bestRank).toBe(1);
      expect(stats.averageRank).toBe(3); // (3 + 1 + 5) / 3 = 3
    });

    it('should return zero stats for empty data', () => {
      const stats = calculateRegionalStats([]);

      expect(stats.weeksOnList).toBe(0);
      expect(stats.bestRank).toBe(0);
      expect(stats.averageRank).toBe(0);
    });

    it('should round average rank to nearest integer', () => {
      const weekData: RegionalWeekData[] = [
        { region: 'PNBA', weekDate: '2025-01-01', rank: 2, category: 'Fiction', listTitle: 'Fiction' },
        { region: 'PNBA', weekDate: '2025-01-08', rank: 3, category: 'Fiction', listTitle: 'Fiction' },
      ];

      const stats = calculateRegionalStats(weekData);
      expect(stats.averageRank).toBe(3); // (2 + 3) / 2 = 2.5 rounds to 3
    });
  });

  describe('generateWeekDates', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate 26 week dates when range is 26', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00')); // Wednesday

      const dates = generateWeekDates(26);

      expect(dates).toHaveLength(26);
      expect(dates[0]).toBe('2025-01-15'); // Most recent Wednesday
      expect(dates[25]).toBe('2024-07-24'); // 25 weeks ago
    });

    it('should generate 52 week dates when range is 52', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00'));

      const dates = generateWeekDates(52);

      expect(dates).toHaveLength(52);
      expect(dates[0]).toBe('2025-01-15');
      expect(dates[51]).toBe('2024-01-24'); // 51 weeks ago
    });

    it('should handle "all" range by returning 52 weeks', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00'));

      const dates = generateWeekDates('all');

      expect(dates).toHaveLength(52);
    });

    it('should snap to most recent Wednesday', () => {
      vi.setSystemTime(new Date('2025-01-17T12:00:00')); // Friday

      const dates = generateWeekDates(4);

      expect(dates[0]).toBe('2025-01-15'); // Previous Wednesday
    });
  });
});
