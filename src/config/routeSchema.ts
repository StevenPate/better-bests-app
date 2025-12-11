/**
 * Route and filter schema - single source of truth
 *
 * Defines all valid audience and filter combinations for the application.
 * Routes and URL helpers are derived from this schema to prevent drift between
 * route definitions in App.tsx and URL parsing logic in useFilters.ts.
 *
 * @module routeSchema
 */

/**
 * Valid audience types for filtering books
 * Maps to bestseller audience classifications (Adult, Teen, Children)
 */
export const AUDIENCES = ['adult', 'teen', 'children'] as const;
export type Audience = typeof AUDIENCES[number];

/**
 * Valid filter types for book lists
 * - adds: New books added this week
 * - drops: Books removed from the list
 * - adds-drops: Both adds and drops
 * - no-drops: Current list excluding dropped books
 */
export const FILTERS = ['adds', 'drops', 'adds-drops', 'no-drops'] as const;
export type Filter = typeof FILTERS[number];

/**
 * Route configuration object
 * Represents a single route with optional audience and filter constraints
 */
export interface RouteConfig {
  /** URL path segment (e.g., "adult/adds") */
  path: string;
  /** Audience filter for this route (if any) */
  audience?: Audience;
  /** Filter type for this route (if any) */
  filter?: Filter;
}

/**
 * Generate all valid route combinations
 *
 * Creates routes for:
 * - Filter-only routes (e.g., /adds, /drops)
 * - Audience-only routes (e.g., /adult, /teen)
 * - Combined routes (e.g., /adult/adds, /teen/drops)
 *
 * This function is used by App.tsx to generate all React Router routes
 * dynamically, ensuring consistency with the filter schema.
 *
 * @returns Array of route configurations
 *
 * @example
 * ```typescript
 * const routes = generateRoutes();
 * // Returns 19 routes:
 * // [
 * //   { path: 'adds', filter: 'adds' },
 * //   { path: 'adult', audience: 'adult' },
 * //   { path: 'adult/adds', audience: 'adult', filter: 'adds' },
 * //   ...
 * // ]
 * ```
 */
export function generateRoutes(): RouteConfig[] {
  const routes: RouteConfig[] = [];

  // Filter-only routes (4 routes)
  FILTERS.forEach(filter => {
    routes.push({ path: filter, filter });
  });

  // Audience-only routes (3 routes)
  AUDIENCES.forEach(audience => {
    routes.push({ path: audience, audience });
  });

  // Combined audience + filter routes (12 routes: 3 audiences × 4 filters)
  AUDIENCES.forEach(audience => {
    FILTERS.forEach(filter => {
      routes.push({
        path: `${audience}/${filter}`,
        audience,
        filter
      });
    });
  });

  return routes;
}

/**
 * Build URL path from audience and filter
 *
 * Constructs the URL path segment for a given combination of audience
 * and filter. Returns empty string if both are null/undefined.
 *
 * This function is used by useFilters.ts to construct navigation URLs
 * when filter state changes.
 *
 * @param audience - Audience filter (adult/teen/children) or null for all
 * @param filter - Filter type (adds/drops/etc.) or null for all
 * @returns URL path segment without leading/trailing slashes
 *
 * @example
 * ```typescript
 * buildFilterPath('adult', 'adds')     // 'adult/adds'
 * buildFilterPath('adult', null)       // 'adult'
 * buildFilterPath(null, 'adds')        // 'adds'
 * buildFilterPath(null, null)          // ''
 * ```
 */
export function buildFilterPath(
  audience?: Audience | null,
  filter?: Filter | null
): string {
  if (audience && filter) return `${audience}/${filter}`;
  if (audience) return audience;
  if (filter) return filter;
  return '';
}

/**
 * Parse audience and filter from URL pathname
 *
 * Extracts audience and filter values from a URL path by checking for
 * known audience and filter segments. Returns null for values not present.
 *
 * This function is used by useFilters.ts to determine the current filter
 * state from the browser URL, enabling URL-based state and browser
 * back/forward navigation.
 *
 * Note: Uses includes() for flexible matching - works with full paths
 * like '/region/pnba/adult/adds' as well as relative paths.
 *
 * @param pathname - URL pathname (e.g., '/region/pnba/adult/adds')
 * @returns Object with parsed audience and filter (null if not present)
 *
 * @example
 * ```typescript
 * parseFilterPath('/region/pnba/adult/adds')
 * // { audience: 'adult', filter: 'adds' }
 *
 * parseFilterPath('/region/pnba/adult')
 * // { audience: 'adult', filter: null }
 *
 * parseFilterPath('/region/pnba/adds')
 * // { audience: null, filter: 'adds' }
 *
 * parseFilterPath('/region/pnba')
 * // { audience: null, filter: null }
 * ```
 */
export function parseFilterPath(pathname: string): {
  audience: Audience | null;
  filter: Filter | null;
} {
  const parts = pathname.split('/').filter(Boolean);

  const audience = AUDIENCES.find(a => parts.includes(a)) ?? null;
  const filter = FILTERS.find(f => parts.includes(f)) ?? null;

  return { audience, filter };
}
