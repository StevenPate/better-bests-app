import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    // Spy on console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('in development mode', () => {
    beforeEach(() => {
      // Ensure we're in development mode for these tests
      vi.stubEnv('MODE', 'development');
    });

    it('should log debug messages', () => {
      logger.debug('Test debug message');
      expect(consoleSpy.log).toHaveBeenCalledWith('Test debug message');
    });

    it('should log info messages', () => {
      logger.info('Test info message');
      expect(consoleSpy.info).toHaveBeenCalledWith('Test info message');
    });

    it('should log warnings', () => {
      logger.warn('Test warning');
      expect(consoleSpy.warn).toHaveBeenCalledWith('Test warning');
    });

    it('should log errors', () => {
      const error = new Error('Test error');
      logger.error('Test error message', error);
      expect(consoleSpy.error).toHaveBeenCalledWith('Test error message', error);
    });

    it('should support namespaced debug logging', () => {
      logger.debug('TestNamespace', 'Debug message');
      expect(consoleSpy.log).toHaveBeenCalledWith('[TestNamespace] Debug message');
    });

    it('should support namespaced error logging', () => {
      const error = new Error('Test');
      logger.error('TestNamespace', 'Error message', error);
      expect(consoleSpy.error).toHaveBeenCalledWith('[TestNamespace] Error message', error);
    });
  });

  describe('in production mode', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'production');
      vi.stubEnv('VITE_ENABLE_DEBUG_LOGS', 'false');
    });

    it('should NOT log debug messages', () => {
      logger.debug('Should not appear');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should NOT log info messages', () => {
      logger.info('Should not appear');
      expect(consoleSpy.info).not.toHaveBeenCalled();
    });

    it('should still log warnings', () => {
      logger.warn('Important warning');
      expect(consoleSpy.warn).toHaveBeenCalledWith('Important warning');
    });

    it('should still log errors', () => {
      const error = new Error('Critical error');
      logger.error('Error occurred', error);
      expect(consoleSpy.error).toHaveBeenCalledWith('Error occurred', error);
    });
  });

  describe('with VITE_ENABLE_DEBUG_LOGS=true in production', () => {
    beforeEach(() => {
      vi.stubEnv('MODE', 'production');
      vi.stubEnv('VITE_ENABLE_DEBUG_LOGS', 'true');
    });

    it('should log debug messages when explicitly enabled', () => {
      logger.debug('Debug in production');
      expect(consoleSpy.log).toHaveBeenCalledWith('Debug in production');
    });

    it('should log info messages when explicitly enabled', () => {
      logger.info('Info in production');
      expect(consoleSpy.info).toHaveBeenCalledWith('Info in production');
    });
  });
});
