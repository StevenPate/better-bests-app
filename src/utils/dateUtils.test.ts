import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DateUtils } from './dateUtils';

describe('DateUtils', () => {
  beforeEach(() => {
    // Reset system time before each test
    vi.useRealTimers();
  });

  describe('getMostRecentWednesday', () => {
    it('should return the current day if it is a Wednesday', () => {
      // Wednesday, October 4, 2023
      const wednesday = new Date('2023-10-04T12:00:00');
      vi.setSystemTime(wednesday);

      const result = DateUtils.getMostRecentWednesday();

      expect(result.getDay()).toBe(3); // Wednesday
      expect(result.toDateString()).toBe(wednesday.toDateString());
    });

    it('should return the previous Wednesday if today is Thursday', () => {
      // Thursday, October 5, 2023
      const thursday = new Date('2023-10-05T12:00:00');
      vi.setSystemTime(thursday);

      const result = DateUtils.getMostRecentWednesday();

      expect(result.getDay()).toBe(3); // Wednesday
      expect(result.getDate()).toBe(4); // October 4
    });

    it('should return the previous Wednesday if today is Monday', () => {
      // Monday, October 2, 2023
      const monday = new Date('2023-10-02T12:00:00');
      vi.setSystemTime(monday);

      const result = DateUtils.getMostRecentWednesday();

      expect(result.getDay()).toBe(3); // Wednesday
      expect(result.getDate()).toBe(27); // September 27
      expect(result.getMonth()).toBe(8); // September (0-indexed)
    });

    it('should return the previous Wednesday if today is Sunday', () => {
      // Sunday, October 8, 2023
      const sunday = new Date('2023-10-08T12:00:00');
      vi.setSystemTime(sunday);

      const result = DateUtils.getMostRecentWednesday();

      expect(result.getDay()).toBe(3); // Wednesday
      expect(result.getDate()).toBe(4); // October 4
    });

    it('should return a Wednesday', () => {
      const result = DateUtils.getMostRecentWednesday();

      // Should always be Wednesday (day 3)
      expect(result.getDay()).toBe(3);
    });
  });

  describe('getPreviousWednesday', () => {
    it('should return 7 days before the most recent Wednesday', () => {
      // Wednesday, October 11, 2023
      const wednesday = new Date('2023-10-11T12:00:00');
      vi.setSystemTime(wednesday);

      const result = DateUtils.getPreviousWednesday();

      expect(result.getDay()).toBe(3); // Wednesday
      expect(result.getDate()).toBe(4); // October 4 (7 days earlier)
    });

    it('should return the correct date across month boundaries', () => {
      // Wednesday, November 1, 2023
      const wednesday = new Date('2023-11-01T12:00:00');
      vi.setSystemTime(wednesday);

      const result = DateUtils.getPreviousWednesday();

      expect(result.getDay()).toBe(3); // Wednesday
      expect(result.getDate()).toBe(25); // October 25
      expect(result.getMonth()).toBe(9); // October (0-indexed)
    });
  });

  describe('formatAsYYMMDD', () => {
    it('should format date as YYMMDD', () => {
      const date = new Date('2023-10-04T12:00:00');

      const result = DateUtils.formatAsYYMMDD(date);

      expect(result).toBe('231004');
    });

    it('should pad single-digit month and day with zeros', () => {
      const date = new Date('2023-01-05T12:00:00');

      const result = DateUtils.formatAsYYMMDD(date);

      expect(result).toBe('230105');
    });

    it('should handle December correctly', () => {
      const date = new Date('2023-12-25T12:00:00');

      const result = DateUtils.formatAsYYMMDD(date);

      expect(result).toBe('231225');
    });

    it('should use last two digits of year', () => {
      const date = new Date('2099-06-15T12:00:00');

      const result = DateUtils.formatAsYYMMDD(date);

      expect(result).toBe('990615');
    });
  });

  describe('getListUrls', () => {
    it('should return URLs for current and previous weeks', () => {
      // Wednesday, October 11, 2023
      const wednesday = new Date('2023-10-11T12:00:00');
      vi.setSystemTime(wednesday);

      const result = DateUtils.getListUrls();

      expect(result.current).toBe('https://www.bookweb.org/sites/default/files/regional_bestseller/231011pn.txt');
      expect(result.previous).toBe('https://www.bookweb.org/sites/default/files/regional_bestseller/231004pn.txt');
    });

    it('should use bookweb.org domain', () => {
      const result = DateUtils.getListUrls();

      expect(result.current).toContain('bookweb.org');
      expect(result.previous).toContain('bookweb.org');
    });

    it('should include pn.txt extension', () => {
      const result = DateUtils.getListUrls();

      expect(result.current.endsWith('pn.txt')).toBe(true);
      expect(result.previous.endsWith('pn.txt')).toBe(true);
    });
  });
});
