import { describe, it, expect } from 'vitest';
import { calculateWeeklyScore, calculateRSI, calculateRSIVariance } from './performanceScoring';

describe('performanceScoring', () => {
  describe('calculateWeeklyScore', () => {
    it('should return 100 for rank #1 on any list size', () => {
      expect(calculateWeeklyScore(1, 15)).toBeCloseTo(100, 1);
      expect(calculateWeeklyScore(1, 20)).toBeCloseTo(100, 1);
    });

    it('should return decreasing scores for lower ranks', () => {
      const score1 = calculateWeeklyScore(1, 15);
      const score5 = calculateWeeklyScore(5, 15);
      const score10 = calculateWeeklyScore(10, 15);

      expect(score1).toBeGreaterThan(score5);
      expect(score5).toBeGreaterThan(score10);
    });

    it('should normalize across different list sizes', () => {
      // Last position should score similarly low regardless of list size
      const score15 = calculateWeeklyScore(15, 15);
      const score20 = calculateWeeklyScore(20, 20);

      expect(Math.abs(score15 - score20)).toBeLessThan(5);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateWeeklyScore(0, 15)).toBe(0);
      expect(calculateWeeklyScore(-1, 15)).toBe(0);
      expect(calculateWeeklyScore(5, 0)).toBe(0);
      expect(calculateWeeklyScore(5, -1)).toBe(0);
    });
  });

  describe('calculateRSI', () => {
    it('should return RSI values that sum to 1.0', () => {
      const regionalScores = {
        'PNBA': 500,
        'SIBA': 300,
        'GLIBA': 200,
      };

      const rsi = calculateRSI(regionalScores);
      const sum = Object.values(rsi).reduce((acc, val) => acc + val, 0);

      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should return correct proportions', () => {
      const regionalScores = {
        'PNBA': 600,
        'SIBA': 400,
      };

      const rsi = calculateRSI(regionalScores);

      expect(rsi['PNBA']).toBeCloseTo(0.6, 5);
      expect(rsi['SIBA']).toBeCloseTo(0.4, 5);
    });

    it('should handle zero total score', () => {
      const regionalScores = {
        'PNBA': 0,
        'SIBA': 0,
      };

      const rsi = calculateRSI(regionalScores);

      expect(rsi['PNBA']).toBe(0);
      expect(rsi['SIBA']).toBe(0);
    });
  });

  describe('calculateRSIVariance', () => {
    it('should return 0 for uniform distribution', () => {
      const rsiValues = [0.25, 0.25, 0.25, 0.25];
      const variance = calculateRSIVariance(rsiValues);

      expect(variance).toBeCloseTo(0, 5);
    });

    it('should return higher variance for uneven distribution', () => {
      const uniformValues = [0.25, 0.25, 0.25, 0.25];
      const unevenValues = [0.7, 0.1, 0.1, 0.1];

      const uniformVariance = calculateRSIVariance(uniformValues);
      const unevenVariance = calculateRSIVariance(unevenValues);

      expect(unevenVariance).toBeGreaterThan(uniformVariance);
    });
  });
});
