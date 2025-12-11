/**
 * Navigation Helper Utilities
 *
 * Shared utilities for determining active navigation states across
 * desktop and mobile navigation components.
 */

/**
 * Check if the current pathname exactly matches the target path
 *
 * @param pathname - Current location pathname
 * @param path - Target path to match
 * @returns true if exact match
 *
 * @example
 * isExactMatch('/elsewhere', '/elsewhere') // true
 * isExactMatch('/elsewhere/foo', '/elsewhere') // false
 */
export function isExactMatch(pathname: string, path: string): boolean {
  return pathname === path;
}

/**
 * Check if the current pathname is within a region section
 *
 * Used for highlighting navigation items that represent an entire section.
 * For example, "Current" should be highlighted for /region/pnba,
 * /region/pnba/adds, /region/pnba/book/:isbn, etc.
 * Excludes Elsewhere and Unique routes to prevent conflicts.
 *
 * @param pathname - Current location pathname
 * @param regionPath - Base region path (e.g., '/region/pnba')
 * @returns true if pathname is exactly regionPath or a sub-route (excluding /elsewhere and /unique)
 *
 * @example
 * isRegionSection('/region/pnba', '/region/pnba') // true
 * isRegionSection('/region/pnba/adds', '/region/pnba') // true
 * isRegionSection('/region/pnba/book/123', '/region/pnba') // true
 * isRegionSection('/region/pnba/elsewhere', '/region/pnba') // false (excluded)
 * isRegionSection('/region/pnba/unique', '/region/pnba') // false (excluded)
 * isRegionSection('/region/pnba-test', '/region/pnba') // false (not a sub-route)
 * isRegionSection('/elsewhere', '/region/pnba') // false
 */
export function isRegionSection(pathname: string, regionPath: string): boolean {
  if (!regionPath.startsWith('/region/')) return false;

  // Exclude Elsewhere and Unique routes
  if (pathname.includes('/elsewhere')) return false;
  if (pathname.includes('/unique')) return false;

  // Exact match
  if (pathname === regionPath) return true;

  // Sub-route must start with regionPath followed by a slash
  return pathname.startsWith(regionPath + '/');
}
