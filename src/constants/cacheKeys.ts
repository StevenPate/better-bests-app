/**
 * Shared cache key constants for consistency between frontend and edge functions
 * These ensure we always use the same keys when storing and retrieving cache
 */

export const CACHE_KEYS = {
  // Base key for current bestseller data (no comparison)
  CURRENT_LIST: 'current_bestseller_list',

  // Function to generate comparison key
  getComparisonKey: (comparisonWeek: string): string => {
    return `bestseller_list_vs_${comparisonWeek}`;
  },

  // Legacy keys (for backward compatibility)
  LEGACY_PATTERN: /^bestseller_list_vs_\d{4}-\d{2}-\d{2}$/,
} as const;

/**
 * Helper to determine which cache key to use
 */
export function getCacheKey(comparisonWeek?: string | null): string {
  return comparisonWeek
    ? CACHE_KEYS.getComparisonKey(comparisonWeek)
    : CACHE_KEYS.CURRENT_LIST;
}