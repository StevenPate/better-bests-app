/**
 * Feature flag system for controlling experimental features
 *
 * SAFETY: All features default to OFF in production.
 * Per-environment overrides via .env.staging allow testing ahead.
 *
 * Usage:
 *   import { isFeatureEnabled, FEATURES } from '@/lib/featureFlags';
 *
 *   if (isFeatureEnabled(FEATURES.MULTI_REGION)) {
 *     // Show multi-region UI
 *   }
 *
 * Environment Configuration:
 *   Production (.env.production):   VITE_ENABLE_MULTI_REGION=false (or omit)
 *   Staging (.env.staging):         VITE_ENABLE_MULTI_REGION=true
 *   Development (.env):             VITE_ENABLE_MULTI_REGION=false (or omit)
 */

export const FEATURES = {
  MULTI_REGION: 'MULTI_REGION',
  // Add more features as needed
} as const;

export type FeatureName = typeof FEATURES[keyof typeof FEATURES];

/**
 * Feature flag defaults (IMPORTANT: All default to false for safety)
 *
 * Production will use these defaults unless explicitly overridden.
 * Staging can override to test features before production release.
 */
const FEATURE_DEFAULTS: Record<FeatureName, boolean> = {
  MULTI_REGION: false, // Default OFF - only enable in staging for testing
};

/**
 * Check if a feature is enabled via environment variable
 *
 * Features default to OFF. Per-environment overrides in .env files.
 *
 * @param feature - Feature name from FEATURES constant
 * @returns true if feature is enabled, false otherwise (default)
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled(FEATURES.MULTI_REGION)) {
 *   // Show multi-region navigation
 * }
 * ```
 */
export function isFeatureEnabled(feature: FeatureName): boolean {
  const envVarName = `VITE_ENABLE_${feature}`;
  const envValue = import.meta.env[envVarName];

  // If explicitly set in environment, use that value
  if (envValue === 'true' || envValue === true) {
    return true;
  }

  if (envValue === 'false' || envValue === false) {
    return false;
  }

  // Otherwise use safe default (always false)
  return FEATURE_DEFAULTS[feature] ?? false;
}

/**
 * Get all enabled features (useful for debugging)
 *
 * @returns Array of enabled feature names
 *
 * @example
 * ```typescript
 * const enabled = getEnabledFeatures();
 * console.log('Enabled features:', enabled);
 * // Output: ['MULTI_REGION']
 * ```
 */
export function getEnabledFeatures(): FeatureName[] {
  return Object.values(FEATURES).filter(isFeatureEnabled);
}

/**
 * Log enabled features to console (development only)
 * Includes warning if production flags are enabled
 */
export function logFeatureFlags(): void {
  if (import.meta.env.DEV) {
    const enabled = getEnabledFeatures();
    console.log('[Feature Flags]', enabled.length > 0 ? enabled : 'None enabled (default-off)');
  }

  // Warn if experimental features enabled in production
  if (import.meta.env.PROD) {
    const enabled = getEnabledFeatures();
    if (enabled.length > 0) {
      console.warn(
        '[Feature Flags] WARNING: Experimental features enabled in production:',
        enabled
      );
    }
  }
}
