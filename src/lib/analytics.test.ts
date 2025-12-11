import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent, initPerformanceTracking } from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    // Mock window.umami
    vi.stubGlobal('umami', {
      track: vi.fn()
    });

    // Mock environment variables
    vi.stubEnv('VITE_UMAMI_ENABLED', 'true');
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'test-website-id');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('trackEvent', () => {
    it('should track pdf_download events', () => {
      trackEvent('pdf_download', { format: 'all', audience: 'adult' });

      expect(window.umami?.track).toHaveBeenCalledWith(
        'pdf_download',
        { format: 'all', audience: 'adult' }
      );
    });

    it('should track csv_export events', () => {
      trackEvent('csv_export', { type: 'adds_no_drops', audience: 'adult' });

      expect(window.umami?.track).toHaveBeenCalledWith(
        'csv_export',
        { type: 'adds_no_drops', audience: 'adult' }
      );
    });

    it('should track filter_applied events', () => {
      trackEvent('filter_applied', { filter: 'adds', audience: 'adult' });

      expect(window.umami?.track).toHaveBeenCalledWith(
        'filter_applied',
        { filter: 'adds', audience: 'adult' }
      );
    });

    it('should track search_performed events', () => {
      trackEvent('search_performed', { hasResults: true, termLength: 5 });

      expect(window.umami?.track).toHaveBeenCalledWith(
        'search_performed',
        { hasResults: true, termLength: 5 }
      );
    });

    it('should track page_performance events', () => {
      trackEvent('page_performance', { metric: 'INP', value: 200, page: '/pnba' });

      expect(window.umami?.track).toHaveBeenCalledWith(
        'page_performance',
        { metric: 'INP', value: 200, page: '/pnba' }
      );
    });

    it('should not throw when umami is unavailable', () => {
      vi.stubGlobal('umami', undefined);

      expect(() => {
        trackEvent('pdf_download', { format: 'all', audience: 'adult' });
      }).not.toThrow();
    });

    it('should not track when VITE_UMAMI_ENABLED is false', () => {
      vi.stubEnv('VITE_UMAMI_ENABLED', 'false');
      const trackMock = vi.fn();
      vi.stubGlobal('umami', { track: trackMock });

      trackEvent('pdf_download', { format: 'all', audience: 'adult' });

      expect(trackMock).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', () => {
      const trackMock = vi.fn().mockImplementation(() => {
        throw new Error('Tracking failed');
      });
      vi.stubGlobal('umami', { track: trackMock });

      expect(() => {
        trackEvent('pdf_download', { format: 'all', audience: 'adult' });
      }).not.toThrow();
    });
  });

  describe('initPerformanceTracking', () => {
    it('should not throw when initialized', () => {
      expect(() => {
        initPerformanceTracking();
      }).not.toThrow();
    });

    it('should not initialize when VITE_UMAMI_ENABLED is false', () => {
      vi.stubEnv('VITE_UMAMI_ENABLED', 'false');

      expect(() => {
        initPerformanceTracking();
      }).not.toThrow();
    });
  });
});
