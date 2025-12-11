/**
 * Performance Scoring Service
 *
 * Utilities for calculating book performance scores, RSI, and related metrics.
 * See docs/plans/2025-11-08-performance-scoring-design.md for methodology.
 */

/**
 * Calculate weekly performance score using logarithmic decay formula
 *
 * Formula: 100 * (1 - log(rank) / log(list_size + 1))
 *
 * This normalizes across different list sizes and emphasizes top positions.
 *
 * @param rank - Position on the list (1-based)
 * @param listSize - Total number of books on the list
 * @returns Score from 0-100
 */
export function calculateWeeklyScore(rank: number, listSize: number): number {
  if (rank < 1 || listSize < 1) return 0;

  return 100 * (1 - Math.log(rank) / Math.log(listSize + 1));
}

/**
 * Calculate Regional Strength Index (RSI) for a book
 *
 * RSI shows what percentage of a book's total performance came from each region.
 * Values range from 0 to 1, and sum to 1.0 across all regions.
 *
 * @param regionalScores - Map of region code to regional score
 * @returns Map of region code to RSI value (0-1)
 */
export function calculateRSI(
  regionalScores: Record<string, number>
): Record<string, number> {
  const totalScore = Object.values(regionalScores).reduce((sum, score) => sum + score, 0);

  if (totalScore === 0) {
    return Object.fromEntries(
      Object.keys(regionalScores).map(region => [region, 0])
    );
  }

  return Object.fromEntries(
    Object.entries(regionalScores).map(([region, score]) => [
      region,
      score / totalScore
    ])
  );
}

/**
 * Calculate RSI variance for "Most National" ranking
 *
 * Lower variance indicates more evenly distributed performance across regions.
 * Higher variance indicates concentration in specific regions.
 *
 * @param rsiValues - Array of RSI values
 * @returns Variance value
 */
export function calculateRSIVariance(rsiValues: number[]): number {
  if (rsiValues.length === 0) return 0;

  const mean = rsiValues.reduce((sum, val) => sum + val, 0) / rsiValues.length;
  const variance = rsiValues.reduce(
    (sum, val) => sum + Math.pow(val - mean, 2),
    0
  ) / rsiValues.length;

  return variance;
}
