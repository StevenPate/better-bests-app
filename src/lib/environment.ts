/**
 * Environment detection and configuration utility
 *
 * Provides type-safe access to environment variables and environment detection.
 * All feature flags default to OFF for production safety.
 */

export const ENV = {
  /**
   * True if running in production mode
   * Determined by VITE_ENVIRONMENT="production" or Vite's PROD mode
   */
  isProduction: import.meta.env.VITE_ENVIRONMENT === 'production' ||
                import.meta.env.PROD,

  /**
   * True if running in staging environment
   * Determined by VITE_ENVIRONMENT="staging"
   */
  isStaging: import.meta.env.VITE_ENVIRONMENT === 'staging',

  /**
   * True if running in development mode
   * Determined by Vite's DEV mode
   */
  isDevelopment: import.meta.env.DEV,

  /**
   * Multi-region feature flag
   * Default: false (PNBA-only mode)
   * Enable in staging first before production rollout
   */
  multiRegionEnabled: import.meta.env.VITE_ENABLE_MULTI_REGION === 'true',

  /**
   * Supabase project URL
   * Required for database connection
   */
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
} as const;

/**
 * Get human-readable environment name
 *
 * @returns "Staging", "Development", or "Production"
 *
 * @example
 * ```typescript
 * console.log(`Running in ${getEnvironmentName()}`);
 * // Output: "Running in Staging"
 * ```
 */
export function getEnvironmentName(): string {
  if (ENV.isStaging) return 'Staging';
  if (ENV.isDevelopment) return 'Development';
  return 'Production';
}

/**
 * Check if a feature flag is enabled
 *
 * Provides centralized feature flag checking with type safety.
 * All flags default to false for production safety.
 *
 * @param flagName - Name of the feature flag
 * @returns boolean indicating if flag is enabled
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled('MULTI_REGION')) {
 *   // Show multi-region UI
 * }
 * ```
 */
export function isFeatureEnabled(flagName: 'MULTI_REGION'): boolean {
  switch (flagName) {
    case 'MULTI_REGION':
      return ENV.multiRegionEnabled;
    default:
      return false;
  }
}
