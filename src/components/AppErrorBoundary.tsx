/**
 * Application Error Boundary
 *
 * Catches unhandled errors in React component tree and displays
 * a user-friendly fallback UI with recovery options.
 *
 * Features:
 * - Catches render-time errors
 * - Displays error code for debugging (staff only)
 * - Provides reset/retry functionality
 * - Logs errors for monitoring
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { isAppError, createUserMessage, logError, ErrorCode } from '@/lib/errors';

interface Props {
  children: ReactNode;
  onReset?: () => void;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error with component stack info
    logError('ErrorBoundary', error, {
      componentStack: errorInfo.componentStack?.slice(0, 200),
    });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      // Default fallback UI
      const error = this.state.error;
      let userMessage;
      let errorCode: string | undefined;

      if (isAppError(error)) {
        userMessage = createUserMessage(error.code);
        errorCode = error.code;
      } else {
        userMessage = createUserMessage(ErrorCode.UNKNOWN_ERROR);
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>Something went wrong</CardTitle>
              </div>
              <CardDescription>
                {userMessage.short}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {userMessage.long}
              </p>

              {errorCode && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs font-mono text-muted-foreground">
                    Error Code: {errorCode}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={this.reset}
                  className="flex-1"
                >
                  {userMessage.recoveryAction || 'Try Again'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/'}
                  className="flex-1"
                >
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary wrapper for easier use in functional components
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  onReset?: () => void
) {
  return function WithErrorBoundary(props: P) {
    return (
      <AppErrorBoundary onReset={onReset}>
        <Component {...props} />
      </AppErrorBoundary>
    );
  };
}
