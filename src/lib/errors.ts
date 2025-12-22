/**
 * Enhanced Error Handling Library
 *
 * Provides structured error primitives with machine-readable codes,
 * user-friendly messages, and logger integration for consistent error
 * handling across the application.
 *
 * @see docs/implementation/issue-plans/enhanced-error-messages-plan.md
 */

import { logger } from './logger';

/**
 * Machine-readable error codes for consistent error handling
 */
export enum ErrorCode {
  // Data fetching errors
  DATA_FETCH_FAILED = 'DATA_FETCH_FAILED',
  PARSE_FAILED = 'PARSE_FAILED',

  // Export errors
  PDF_GENERATION_FAILED = 'PDF_GENERATION_FAILED',
  CSV_EXPORT_FAILED = 'CSV_EXPORT_FAILED',

  // External service errors
  GOOGLE_BOOKS_TIMEOUT = 'GOOGLE_BOOKS_TIMEOUT',
  GOOGLE_BOOKS_API_ERROR = 'GOOGLE_BOOKS_API_ERROR',
  API_RATE_LIMIT = 'API_RATE_LIMIT',

  // Database/cache errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',

  // Configuration errors
  CONFIG_ERROR = 'CONFIG_ERROR',
  REGION_NOT_FOUND = 'REGION_NOT_FOUND',

  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',

  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Default user-friendly messages for each error code
 */
const defaultMessages: Record<ErrorCode, string> = {
  [ErrorCode.DATA_FETCH_FAILED]: 'Failed to fetch data',
  [ErrorCode.PARSE_FAILED]: 'Failed to parse data',
  [ErrorCode.PDF_GENERATION_FAILED]: 'Failed to generate PDF',
  [ErrorCode.CSV_EXPORT_FAILED]: 'Failed to export CSV',
  [ErrorCode.GOOGLE_BOOKS_TIMEOUT]: 'Google Books request timed out',
  [ErrorCode.GOOGLE_BOOKS_API_ERROR]: 'Google Books API error',
  [ErrorCode.API_RATE_LIMIT]: 'API rate limit exceeded',
  [ErrorCode.DATABASE_ERROR]: 'Database operation failed',
  [ErrorCode.CACHE_ERROR]: 'Cache operation failed',
  [ErrorCode.CONFIG_ERROR]: 'Configuration error',
  [ErrorCode.REGION_NOT_FOUND]: 'Region not found',
  [ErrorCode.AUTH_REQUIRED]: 'Authentication required',
  [ErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
};

/**
 * User-facing message variants (short and long)
 */
interface UserMessage {
  short: string;
  long: string;
  recoveryAction?: string;
}

/**
 * User-friendly messages with guidance for each error code
 */
const userMessages: Record<ErrorCode, UserMessage> = {
  [ErrorCode.DATA_FETCH_FAILED]: {
    short: "We couldn't load the bestseller list.",
    long: "Please check your internet connection or try again—our team has been notified if the issue persists.",
    recoveryAction: 'Retry',
  },
  [ErrorCode.PARSE_FAILED]: {
    short: "The data format looks invalid.",
    long: "Upload the latest PNBA report or contact support if you believe this is a mistake.",
    recoveryAction: 'Contact Support',
  },
  [ErrorCode.PDF_GENERATION_FAILED]: {
    short: "PDF export hit a snag.",
    long: "Try generating a smaller list or retry in a moment.",
    recoveryAction: 'Retry',
  },
  [ErrorCode.CSV_EXPORT_FAILED]: {
    short: "CSV export didn't finish.",
    long: "Retry the export or refresh the page to start clean.",
    recoveryAction: 'Retry',
  },
  [ErrorCode.GOOGLE_BOOKS_TIMEOUT]: {
    short: "We couldn't fetch genre info.",
    long: "We'll keep using default genres for now; retry if you need the latest data.",
    recoveryAction: 'Continue',
  },
  [ErrorCode.GOOGLE_BOOKS_API_ERROR]: {
    short: "Google Books API error.",
    long: "We encountered an issue fetching book metadata. The list will display without genre information.",
    recoveryAction: 'Continue',
  },
  [ErrorCode.API_RATE_LIMIT]: {
    short: "Too many requests.",
    long: "We're being rate limited by an external service. Please wait a moment and try again.",
    recoveryAction: 'Wait & Retry',
  },
  [ErrorCode.DATABASE_ERROR]: {
    short: "Database error.",
    long: "We encountered an issue accessing the database. Please try again or contact support.",
    recoveryAction: 'Retry',
  },
  [ErrorCode.CACHE_ERROR]: {
    short: "Cache error.",
    long: "We encountered an issue with cached data. Refreshing will fetch fresh data.",
    recoveryAction: 'Refresh',
  },
  [ErrorCode.CONFIG_ERROR]: {
    short: "Configuration error.",
    long: "The application is missing required configuration. Please contact support.",
    recoveryAction: 'Contact Support',
  },
  [ErrorCode.REGION_NOT_FOUND]: {
    short: "Region not found.",
    long: "The selected region is not available. Please select a different region.",
    recoveryAction: 'Select Region',
  },
  [ErrorCode.AUTH_REQUIRED]: {
    short: "Authentication required.",
    long: "Please sign in to access this feature.",
    recoveryAction: 'Sign In',
  },
  [ErrorCode.UNKNOWN_ERROR]: {
    short: "Something went wrong.",
    long: "An unexpected error occurred. Please try again or contact support if the problem persists.",
    recoveryAction: 'Retry',
  },
};

/**
 * Sanitizes error context by:
 * - Removing sensitive data
 * - Truncating long strings
 * - Converting to primitive types
 */
function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  // Cap at 5 fields as per plan guidelines
  const entries = Object.entries(context).slice(0, 5);

  for (const [key, value] of entries) {
    // Redact sensitive fields
    if (key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('key')) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Truncate long strings
    if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = value.slice(0, 100) + '...';
      continue;
    }

    // Convert to primitives
    if (value === null || value === undefined) {
      sanitized[key] = null;
    } else if (typeof value === 'object') {
      sanitized[key] = '[Object]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Base application error class with structured error handling
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly context: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    context: Record<string, unknown> = {},
    message?: string,
    public readonly cause?: unknown
  ) {
    super(message ?? defaultMessages[code]);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a logger-friendly payload with sanitized context
   */
  toLogPayload(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      context: sanitizeContext(this.context),
      timestamp: this.timestamp,
      ...(this.cause && { cause: String(this.cause) }),
    };
  }
}

/**
 * Error thrown when data fetching fails
 */
export class FetchError extends AppError {
  constructor(
    code: ErrorCode = ErrorCode.DATA_FETCH_FAILED,
    context: Record<string, unknown> = {},
    cause?: unknown
  ) {
    super(code, context, defaultMessages[code], cause);
    this.name = 'FetchError';
  }
}

/**
 * Error thrown when parsing fails
 */
export class ParseError extends AppError {
  constructor(
    context: Record<string, unknown> = {},
    message?: string,
    cause?: unknown
  ) {
    super(ErrorCode.PARSE_FAILED, context, message ?? defaultMessages[ErrorCode.PARSE_FAILED], cause);
    this.name = 'ParseError';
  }
}

/**
 * Error thrown when export operations fail
 */
export class ExportError extends AppError {
  constructor(
    code: ErrorCode,
    context: Record<string, unknown> = {},
    cause?: unknown
  ) {
    super(code, context, defaultMessages[code], cause);
    this.name = 'ExportError';
  }
}

/**
 * Error thrown when PDF generation fails
 */
export class PdfError extends ExportError {
  constructor(
    context: Record<string, unknown> = {},
    cause?: unknown
  ) {
    super(ErrorCode.PDF_GENERATION_FAILED, context, cause);
    this.name = 'PdfError';
  }
}

/**
 * Error thrown when CSV export fails
 */
export class CsvError extends ExportError {
  constructor(
    context: Record<string, unknown> = {},
    cause?: unknown
  ) {
    super(ErrorCode.CSV_EXPORT_FAILED, context, cause);
    this.name = 'CsvError';
  }
}

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(
    context: Record<string, unknown> = {},
    message?: string,
    cause?: unknown
  ) {
    super(ErrorCode.DATABASE_ERROR, context, message ?? defaultMessages[ErrorCode.DATABASE_ERROR], cause);
    this.name = 'DatabaseError';
  }
}

/**
 * Error thrown when cache operations fail
 */
export class CacheError extends AppError {
  constructor(
    context: Record<string, unknown> = {},
    message?: string,
    cause?: unknown
  ) {
    super(ErrorCode.CACHE_ERROR, context, message ?? defaultMessages[ErrorCode.CACHE_ERROR], cause);
    this.name = 'CacheError';
  }
}

/**
 * Error thrown when configuration is missing or invalid
 */
export class ConfigError extends AppError {
  constructor(
    context: Record<string, unknown> = {},
    message?: string,
    cause?: unknown
  ) {
    super(ErrorCode.CONFIG_ERROR, context, message ?? defaultMessages[ErrorCode.CONFIG_ERROR], cause);
    this.name = 'ConfigError';
  }
}

/**
 * Error thrown when a region is not found or invalid
 */
export class RegionError extends AppError {
  constructor(
    context: Record<string, unknown> = {},
    message?: string,
    cause?: unknown
  ) {
    super(ErrorCode.REGION_NOT_FOUND, context, message ?? defaultMessages[ErrorCode.REGION_NOT_FOUND], cause);
    this.name = 'RegionError';
  }
}

/**
 * Type guard to check if a value is an AppError
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Type guard to check if an error has a specific error code
 */
export function hasErrorCode(
  error: unknown,
  code: ErrorCode
): error is AppError & { code: ErrorCode } {
  return isAppError(error) && error.code === code;
}

/**
 * Creates a user-friendly message for display in UI
 *
 * @param code - The error code
 * @param variant - Message variant ('short' or 'long')
 * @param context - Optional context for message interpolation
 * @returns User-friendly message object
 */
export function createUserMessage(
  code: ErrorCode,
  variant: 'short' | 'long' = 'short',
  context?: Record<string, unknown>
): UserMessage {
  const message = userMessages[code] || userMessages[ErrorCode.UNKNOWN_ERROR];

  if (variant === 'short') {
    return {
      short: message.short,
      long: message.long,
      recoveryAction: message.recoveryAction,
    };
  }

  return message;
}

/**
 * Logs an error with appropriate context
 *
 * @param namespace - Logger namespace
 * @param error - Error to log
 * @param additionalContext - Additional context to include
 */
export function logError(
  namespace: string,
  error: unknown,
  additionalContext?: Record<string, unknown>
): void {
  if (isAppError(error)) {
    logger.error(namespace, error.message, {
      ...error.toLogPayload(),
      ...additionalContext,
    });
  } else if (error instanceof Error) {
    logger.error(namespace, error.message, {
      name: error.name,
      stack: error.stack,
      ...additionalContext,
    });
  } else {
    logger.error(namespace, 'Unknown error', {
      error: String(error),
      ...additionalContext,
    });
  }
}

/**
 * Wraps an error in an AppError if it isn't already one
 *
 * @param error - Error to wrap
 * @param code - Error code to use if wrapping
 * @param context - Context to include
 * @returns AppError instance
 */
export function wrapError(
  error: unknown,
  code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
  context: Record<string, unknown> = {}
): AppError {
  if (isAppError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AppError(code, context, message, error);
}

/**
 * Feature flag for enhanced error handling
 * Defaults to enabled unless explicitly disabled
 */
export function isEnhancedErrorsEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_ENHANCED_ERRORS !== 'false';
}
