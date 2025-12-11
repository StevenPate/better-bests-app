import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFeatureEnabled, FEATURES, getEnabledFeatures } from './featureFlags';

describe('featureFlags', () => {
  beforeEach(() => {
    // Reset environment
    vi.stubEnv('VITE_ENABLE_MULTI_REGION', 'false');
  });

  it('should return false for disabled multi-region feature', () => {
    expect(isFeatureEnabled(FEATURES.MULTI_REGION)).toBe(false);
  });

  it('should return true when feature is enabled', () => {
    vi.stubEnv('VITE_ENABLE_MULTI_REGION', 'true');
    expect(isFeatureEnabled(FEATURES.MULTI_REGION)).toBe(true);
  });

  it('should default to false for unrecognized environment values', () => {
    vi.stubEnv('VITE_ENABLE_MULTI_REGION', 'maybe');
    expect(isFeatureEnabled(FEATURES.MULTI_REGION)).toBe(false);
  });

  it('should return empty array when no features enabled', () => {
    vi.stubEnv('VITE_ENABLE_MULTI_REGION', 'false');
    expect(getEnabledFeatures()).toEqual([]);
  });

  it('should return array of enabled features', () => {
    vi.stubEnv('VITE_ENABLE_MULTI_REGION', 'true');
    expect(getEnabledFeatures()).toContain('MULTI_REGION');
  });
});
