import { onCLS, onINP, onLCP } from 'web-vitals';
import { logger } from './logger';

/**
 * Analytics event types and their properties
 */
type AnalyticsEvent =
  | {
      name: 'pdf_download';
      props: {
        format: 'all' | 'adds_drops';
        audience: 'adult' | 'teen' | 'children' | 'all';
      };
    }
  | {
      name: 'csv_export';
      props: {
        type: 'adds_no_drops' | 'adds_only' | 'drops_only';
        audience: string;
      };
    }
  | {
      name: 'filter_applied';
      props: {
        filter: 'all' | 'adds' | 'drops' | 'adds_drops';
        audience?: string;
      };
    }
  | {
      name: 'search_performed';
      props: {
        hasResults: boolean;
        termLength: number;
      };
    }
  | {
      name: 'page_performance';
      props: {
        metric: 'LCP' | 'INP' | 'CLS';
        value: number;
        page: string;
      };
    };

/**
 * Extend window interface for Umami
 */
declare global {
  interface Window {
    umami?: {
      track(event: string, data?: Record<string, unknown>): void;
    };
  }
}

/**
 * Track a custom analytics event
 *
 * @param name - Event name (type-safe)
 * @param props - Event properties (type-safe based on event name)
 *
 * @example
 * trackEvent('pdf_download', { format: 'all', audience: 'adult' });
 */
export function trackEvent<T extends AnalyticsEvent>(
  name: T['name'],
  props: T['props']
): void {
  const enabled = import.meta.env.VITE_UMAMI_ENABLED !== 'false';

  if (!enabled) {
    logger.debug('analytics', `Tracking disabled: ${name}`, props);
    return;
  }

  if (!window.umami) {
    logger.debug('analytics', `Umami not loaded: ${name}`, props);
    return;
  }

  try {
    window.umami.track(name, props as Record<string, unknown>);
    logger.debug('analytics', `Event tracked: ${name}`, props);
  } catch (error) {
    logger.error('analytics', 'Failed to track event', error);
  }
}

/**
 * Initialize performance tracking with Web Vitals
 *
 * Automatically tracks Core Web Vitals (LCP, INP, CLS) for each page
 */
export function initPerformanceTracking(): void {
  if (import.meta.env.VITE_UMAMI_ENABLED === 'false') {
    logger.debug('analytics', 'Performance tracking disabled');
    return;
  }

  try {
    onLCP((metric) => {
      trackEvent('page_performance', {
        metric: 'LCP',
        value: metric.value,
        page: window.location.pathname
      });
    });

    onINP((metric) => {
      trackEvent('page_performance', {
        metric: 'INP',
        value: metric.value,
        page: window.location.pathname
      });
    });

    onCLS((metric) => {
      trackEvent('page_performance', {
        metric: 'CLS',
        value: metric.value,
        page: window.location.pathname
      });
    });

    logger.debug('analytics', 'Performance tracking initialized');
  } catch (error) {
    logger.error('analytics', 'Failed to initialize performance tracking', error);
  }
}
