/**
 * Centralized Error Handler for UI
 *
 * Provides consistent error handling for UI components with toast notifications.
 * Use these helpers instead of manually catching errors and showing toasts.
 *
 * Features:
 * - Automatic error logging
 * - User-friendly toast messages
 * - Error code badges for staff users
 * - Retry/recovery action support
 */

import { isAppError, createUserMessage, logError, ErrorCode, isEnhancedErrorsEnabled } from './errors';
import type { ToastActionElement } from '@/components/ui/toast';

/**
 * Toast function type (from useToast hook)
 */
export type ToastFunction = (props: {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  action?: ToastActionElement;
  duration?: number;
}) => void;

/**
 * Options for error toast display
 */
interface ShowErrorToastOptions {
  toast: ToastFunction;
  error: unknown;
  operation?: string;
  onRetry?: () => void;
  isPbnStaff?: boolean;
}

/**
 * Display a user-friendly error toast with optional retry action
 *
 * @param options - Configuration object
 * @returns void
 *
 * @example
 * try {
 *   await fetchData();
 * } catch (error) {
 *   showErrorToast({
 *     toast,
 *     error,
 *     operation: 'fetching bestseller data',
 *     onRetry: () => refetch(),
 *   });
 * }
 */
export function showErrorToast(options: ShowErrorToastOptions): void {
  const { toast, error, operation, onRetry, isPbnStaff = false } = options;

  // Check if enhanced errors are enabled
  if (!isEnhancedErrorsEnabled()) {
    // Legacy error handling fallback
    const message = error instanceof Error ? error.message : String(error);
    toast({
      title: 'Error',
      description: message,
      variant: 'destructive',
      duration: 5000,
    });
    return;
  }

  // Log the error
  logError('ErrorHandler', error, { operation });

  // Determine error message
  let message;
  let errorCode: string | undefined;

  if (isAppError(error)) {
    message = createUserMessage(error.code);
    errorCode = error.code;
  } else {
    message = createUserMessage(ErrorCode.UNKNOWN_ERROR);
  }

  // Build description with error code badge for staff
  let description = message.long;
  if (errorCode && isPbnStaff) {
    description += `\n\n[${errorCode}]`;
  }

  // Build retry action if provided
  let action: ToastActionElement | undefined;
  if (onRetry && message.recoveryAction) {
    action = {
      altText: message.recoveryAction,
      onClick: onRetry,
    } as ToastActionElement;
  }

  // Display toast
  toast({
    title: message.short,
    description,
    variant: 'destructive',
    action,
    duration: 7000, // Longer duration for errors with actions
  });
}

/**
 * Wrap an async operation with automatic error handling
 *
 * @param fn - Async function to execute
 * @param options - Error handling options
 * @returns Promise that resolves to the function result or undefined on error
 *
 * @example
 * const result = await withErrorHandler(
 *   () => fetchBestsellerData(),
 *   {
 *     toast,
 *     operation: 'fetching bestseller data',
 *     onRetry: () => refetch(),
 *   }
 * );
 */
export async function withErrorHandler<T>(
  fn: () => Promise<T>,
  options: Omit<ShowErrorToastOptions, 'error'>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    showErrorToast({ ...options, error });
    return undefined;
  }
}

/**
 * Create an error handler function bound to specific toast and operation
 *
 * @param toast - Toast function from useToast
 * @param operation - Operation name for logging
 * @returns Error handler function
 *
 * @example
 * const handleError = createErrorHandler(toast, 'fetching data');
 * try {
 *   await fetchData();
 * } catch (error) {
 *   handleError(error, { onRetry: () => refetch() });
 * }
 */
export function createErrorHandler(
  toast: ToastFunction,
  operation: string
) {
  return (error: unknown, options?: { onRetry?: () => void; isPbnStaff?: boolean }) => {
    showErrorToast({
      toast,
      error,
      operation,
      ...options,
    });
  };
}
