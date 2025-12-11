/* eslint-disable no-console */
/**
 * Environment-aware logging utility
 *
 * Provides structured logging with automatic suppression in production.
 * Use this instead of raw console.* calls to keep production bundles clean.
 *
 * @example
 * import { logger } from '@/lib/logger';
 *
 * logger.debug('Detailed diagnostic info'); // Only in development
 * logger.info('General information');        // Only in development
 * logger.warn('Warning message');            // Always logged
 * logger.error('Error message', error);      // Always logged
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  /**
   * Check if a log level should be output
   * Reads environment on every call to support testing with vi.stubEnv
   */
  private shouldLog(level: LogLevel): boolean {
    // Always log warnings and errors
    if (level === 'warn' || level === 'error') {
      return true;
    }

    // Debug and info only in development or when explicitly enabled
    const mode = import.meta.env.MODE || 'production';
    const enableVerbose = import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true';

    return mode === 'development' || enableVerbose;
  }

  /**
   * Format log message with optional namespace
   */
  private formatMessage(namespace: string | undefined, message: string): string {
    return namespace ? `[${namespace}] ${message}` : message;
  }

  /**
   * Debug-level logging (development only)
   * Use for detailed diagnostic information
   */
  debug(...args: any[]): void {
    if (!this.shouldLog('debug')) return;

    const [first, second, ...rest] = args;
    if (typeof first === 'string' && typeof second === 'string') {
      // Called with namespace
      console.log(this.formatMessage(first, second), ...rest);
    } else {
      // Called without namespace
      console.log(first, ...rest.length > 0 || second !== undefined ? [second, ...rest] : []);
    }
  }

  /**
   * Info-level logging (development only)
   * Use for general informational messages
   */
  info(...args: any[]): void {
    if (!this.shouldLog('info')) return;

    const [first, second, ...rest] = args;
    if (typeof first === 'string' && typeof second === 'string') {
      console.info(this.formatMessage(first, second), ...rest);
    } else {
      console.info(first, ...rest.length > 0 || second !== undefined ? [second, ...rest] : []);
    }
  }

  /**
   * Warning-level logging (always logged)
   * Use for recoverable issues that need attention
   */
  warn(...args: any[]): void {
    const [first, second, ...rest] = args;
    if (typeof first === 'string' && typeof second === 'string') {
      console.warn(this.formatMessage(first, second), ...rest);
    } else {
      console.warn(first, ...rest.length > 0 || second !== undefined ? [second, ...rest] : []);
    }
  }

  /**
   * Error-level logging (always logged)
   * Use for errors and exceptions
   */
  error(...args: any[]): void {
    const [first, second, third, ...rest] = args;
    if (typeof first === 'string' && typeof second === 'string') {
      // Called with namespace
      console.error(this.formatMessage(first, second), ...[third, ...rest].filter(arg => arg !== undefined));
    } else {
      // Called without namespace
      console.error(first, ...[second, third, ...rest].filter(arg => arg !== undefined));
    }
  }
}

/**
 * Shared logger instance
 *
 * @example
 * // Basic usage
 * logger.debug('Fetching data...');
 * logger.info('Operation completed');
 * logger.warn('Cache miss, fetching from network');
 * logger.error('Failed to parse data', error);
 *
 * // With namespace for better organization
 * logger.debug('BestsellerParser', 'Starting fetch operation');
 * logger.error('BestsellerParser', 'Parse failed', parseError);
 */
export const logger = new Logger();
