/**
 * Unit tests for error handling library
 *
 * Tests error creation, type guards, message generation,
 * and logger integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppError,
  FetchError,
  ParseError,
  ExportError,
  PdfError,
  CsvError,
  ErrorCode,
  isAppError,
  hasErrorCode,
  createUserMessage,
  logError,
  wrapError,
  isEnhancedErrorsEnabled,
} from './errors';

describe('errors.ts', () => {
  describe('AppError', () => {
    it('should create an error with code and default message', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.DATA_FETCH_FAILED);
      expect(error.message).toBe('Failed to fetch data');
      expect(error.context).toEqual({});
      expect(error.timestamp).toBeDefined();
    });

    it('should create an error with custom message and context', () => {
      const context = { resource: 'bestsellers', attempt: 1 };
      const error = new AppError(
        ErrorCode.DATA_FETCH_FAILED,
        context,
        'Custom error message'
      );

      expect(error.code).toBe(ErrorCode.DATA_FETCH_FAILED);
      expect(error.message).toBe('Custom error message');
      expect(error.context).toEqual(context);
    });

    it('should preserve cause', () => {
      const cause = new Error('Original error');
      const error = new AppError(
        ErrorCode.DATA_FETCH_FAILED,
        {},
        undefined,
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it('should generate log payload with sanitized context', () => {
      const error = new AppError(
        ErrorCode.DATA_FETCH_FAILED,
        { resource: 'bestsellers', token: 'secret123' }
      );

      const payload = error.toLogPayload();

      expect(payload.code).toBe(ErrorCode.DATA_FETCH_FAILED);
      expect(payload.message).toBe('Failed to fetch data');
      expect(payload.context).toHaveProperty('resource', 'bestsellers');
      expect(payload.context).toHaveProperty('token', '[REDACTED]');
      expect(payload.timestamp).toBeDefined();
    });

    it('should include cause in log payload', () => {
      const cause = new Error('Original error');
      const error = new AppError(
        ErrorCode.DATA_FETCH_FAILED,
        {},
        undefined,
        cause
      );

      const payload = error.toLogPayload();

      expect(payload.cause).toBeDefined();
      expect(payload.cause).toContain('Original error');
    });

    it('should sanitize context by truncating long strings', () => {
      const longString = 'a'.repeat(150);
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED, {
        longValue: longString,
      });

      const payload = error.toLogPayload();
      const context = payload.context as Record<string, unknown>;

      expect(context.longValue).toBeDefined();
      expect((context.longValue as string).length).toBeLessThan(longString.length);
      expect((context.longValue as string)).toContain('...');
    });

    it('should sanitize context by limiting fields to 5', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED, {
        field1: 1,
        field2: 2,
        field3: 3,
        field4: 4,
        field5: 5,
        field6: 6,
        field7: 7,
      });

      const payload = error.toLogPayload();
      const context = payload.context as Record<string, unknown>;

      expect(Object.keys(context).length).toBeLessThanOrEqual(5);
    });

    it('should redact sensitive field names', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED, {
        apiKey: 'secret',
        password: 'secret',
        authToken: 'secret',
        clientSecret: 'secret',
      });

      const payload = error.toLogPayload();
      const context = payload.context as Record<string, unknown>;

      expect(context.apiKey).toBe('[REDACTED]');
      expect(context.password).toBe('[REDACTED]');
      expect(context.authToken).toBe('[REDACTED]');
      expect(context.clientSecret).toBe('[REDACTED]');
    });

    it('should convert objects to string representation', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED, {
        nestedObject: { foo: 'bar' },
      });

      const payload = error.toLogPayload();
      const context = payload.context as Record<string, unknown>;

      expect(context.nestedObject).toBe('[Object]');
    });
  });

  describe('Error Subclasses', () => {
    it('should create FetchError with default code', () => {
      const error = new FetchError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(FetchError);
      expect(error.code).toBe(ErrorCode.DATA_FETCH_FAILED);
      expect(error.name).toBe('FetchError');
    });

    it('should create FetchError with custom code', () => {
      const error = new FetchError(
        ErrorCode.GOOGLE_BOOKS_TIMEOUT,
        { resource: 'googleBooks' }
      );

      expect(error.code).toBe(ErrorCode.GOOGLE_BOOKS_TIMEOUT);
    });

    it('should create ParseError', () => {
      const error = new ParseError({ resource: 'parser' });

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ParseError);
      expect(error.code).toBe(ErrorCode.PARSE_FAILED);
      expect(error.name).toBe('ParseError');
    });

    it('should create ExportError', () => {
      const error = new ExportError(ErrorCode.CSV_EXPORT_FAILED);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ExportError);
      expect(error.code).toBe(ErrorCode.CSV_EXPORT_FAILED);
      expect(error.name).toBe('ExportError');
    });

    it('should create PdfError', () => {
      const error = new PdfError({ stage: 'generation' });

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ExportError);
      expect(error).toBeInstanceOf(PdfError);
      expect(error.code).toBe(ErrorCode.PDF_GENERATION_FAILED);
      expect(error.name).toBe('PdfError');
    });

    it('should create CsvError', () => {
      const error = new CsvError({ operation: 'export' });

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ExportError);
      expect(error).toBeInstanceOf(CsvError);
      expect(error.code).toBe(ErrorCode.CSV_EXPORT_FAILED);
      expect(error.name).toBe('CsvError');
    });
  });

  describe('Type Guards', () => {
    describe('isAppError', () => {
      it('should return true for AppError instances', () => {
        const error = new AppError(ErrorCode.DATA_FETCH_FAILED);
        expect(isAppError(error)).toBe(true);
      });

      it('should return true for AppError subclasses', () => {
        const fetchError = new FetchError();
        const parseError = new ParseError();
        const pdfError = new PdfError();

        expect(isAppError(fetchError)).toBe(true);
        expect(isAppError(parseError)).toBe(true);
        expect(isAppError(pdfError)).toBe(true);
      });

      it('should return false for regular Error instances', () => {
        const error = new Error('Regular error');
        expect(isAppError(error)).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(isAppError(null)).toBe(false);
        expect(isAppError(undefined)).toBe(false);
        expect(isAppError('string')).toBe(false);
        expect(isAppError(123)).toBe(false);
        expect(isAppError({})).toBe(false);
      });

      it('should handle malformed inputs safely', () => {
        expect(isAppError({ code: 'fake' })).toBe(false);
        expect(isAppError({ message: 'fake' })).toBe(false);
      });
    });

    describe('hasErrorCode', () => {
      it('should return true for matching error code', () => {
        const error = new AppError(ErrorCode.DATA_FETCH_FAILED);
        expect(hasErrorCode(error, ErrorCode.DATA_FETCH_FAILED)).toBe(true);
      });

      it('should return false for non-matching error code', () => {
        const error = new AppError(ErrorCode.DATA_FETCH_FAILED);
        expect(hasErrorCode(error, ErrorCode.PARSE_FAILED)).toBe(false);
      });

      it('should return false for non-AppError instances', () => {
        const error = new Error('Regular error');
        expect(hasErrorCode(error, ErrorCode.DATA_FETCH_FAILED)).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(hasErrorCode(null, ErrorCode.DATA_FETCH_FAILED)).toBe(false);
        expect(hasErrorCode('string', ErrorCode.DATA_FETCH_FAILED)).toBe(false);
      });
    });
  });

  describe('createUserMessage', () => {
    it('should return short variant by default', () => {
      const message = createUserMessage(ErrorCode.DATA_FETCH_FAILED);

      expect(message.short).toBe("We couldn't load the bestseller list.");
      expect(message.long).toBeDefined();
      expect(message.recoveryAction).toBe('Retry');
    });

    it('should return long variant when requested', () => {
      const message = createUserMessage(ErrorCode.DATA_FETCH_FAILED, 'long');

      expect(message.short).toBeDefined();
      expect(message.long).toContain('check your internet connection');
    });

    it('should return messages for all error codes', () => {
      const codes = Object.values(ErrorCode);

      codes.forEach((code) => {
        const message = createUserMessage(code);
        expect(message.short).toBeDefined();
        expect(message.long).toBeDefined();
      });
    });

    it('should return UNKNOWN_ERROR message for invalid codes', () => {
      const message = createUserMessage('INVALID_CODE' as ErrorCode);

      expect(message.short).toBe('Something went wrong.');
    });

    it('should include recovery actions', () => {
      const dataFetchMessage = createUserMessage(ErrorCode.DATA_FETCH_FAILED);
      expect(dataFetchMessage.recoveryAction).toBe('Retry');

      const parseMessage = createUserMessage(ErrorCode.PARSE_FAILED);
      expect(parseMessage.recoveryAction).toBe('Contact Support');

      const googleMessage = createUserMessage(ErrorCode.GOOGLE_BOOKS_TIMEOUT);
      expect(googleMessage.recoveryAction).toBe('Continue');
    });
  });

  describe('logError', () => {
    it('should log AppError with toLogPayload', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED, {
        resource: 'bestsellers',
      });

      // logError calls logger.error which we're not mocking here,
      // but we can verify it doesn't throw
      expect(() => logError('TestNamespace', error)).not.toThrow();
    });

    it('should log regular Error instances', () => {
      const error = new Error('Regular error');

      expect(() => logError('TestNamespace', error)).not.toThrow();
    });

    it('should log unknown errors as strings', () => {
      expect(() => logError('TestNamespace', 'string error')).not.toThrow();
      expect(() => logError('TestNamespace', 123)).not.toThrow();
      expect(() => logError('TestNamespace', null)).not.toThrow();
    });

    it('should include additional context', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED);
      const additionalContext = { attempt: 2 };

      expect(() =>
        logError('TestNamespace', error, additionalContext)
      ).not.toThrow();
    });
  });

  describe('wrapError', () => {
    it('should return AppError as-is', () => {
      const error = new AppError(ErrorCode.DATA_FETCH_FAILED);
      const wrapped = wrapError(error);

      expect(wrapped).toBe(error);
    });

    it('should wrap regular Error in AppError', () => {
      const error = new Error('Regular error');
      const wrapped = wrapError(error);

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.message).toBe('Regular error');
      expect(wrapped.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(wrapped.cause).toBe(error);
    });

    it('should wrap string errors', () => {
      const wrapped = wrapError('String error');

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.message).toBe('String error');
      expect(wrapped.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('should use custom error code when wrapping', () => {
      const error = new Error('Fetch failed');
      const wrapped = wrapError(error, ErrorCode.DATA_FETCH_FAILED, {
        resource: 'api',
      });

      expect(wrapped.code).toBe(ErrorCode.DATA_FETCH_FAILED);
      expect(wrapped.context).toEqual({ resource: 'api' });
    });
  });

  describe('isEnhancedErrorsEnabled', () => {
    beforeEach(() => {
      // Reset the environment variable before each test
      vi.stubEnv('VITE_ENABLE_ENHANCED_ERRORS', undefined);
    });

    it('should return true by default', () => {
      expect(isEnhancedErrorsEnabled()).toBe(true);
    });

    it('should return false when explicitly disabled', () => {
      vi.stubEnv('VITE_ENABLE_ENHANCED_ERRORS', 'false');
      expect(isEnhancedErrorsEnabled()).toBe(false);
    });

    it('should return true for any non-false value', () => {
      vi.stubEnv('VITE_ENABLE_ENHANCED_ERRORS', 'true');
      expect(isEnhancedErrorsEnabled()).toBe(true);

      vi.stubEnv('VITE_ENABLE_ENHANCED_ERRORS', '1');
      expect(isEnhancedErrorsEnabled()).toBe(true);

      vi.stubEnv('VITE_ENABLE_ENHANCED_ERRORS', 'anything');
      expect(isEnhancedErrorsEnabled()).toBe(true);
    });
  });

  describe('Error Code Registry', () => {
    it('should have messages for all defined error codes', () => {
      const codes = Object.values(ErrorCode);

      codes.forEach((code) => {
        const message = createUserMessage(code);
        expect(message).toBeDefined();
        expect(message.short).toBeTruthy();
        expect(message.long).toBeTruthy();
      });
    });
  });
});
