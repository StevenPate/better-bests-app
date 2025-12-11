import { ReactNode, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** Main error heading */
  title: string;
  /** Optional error description or message */
  description?: string;
  /** Optional icon component (defaults to AlertCircle) */
  icon?: ReactNode;
  /** Optional retry callback */
  onRetry?: () => void;
  /** Optional reset filters callback */
  onResetFilters?: () => void;
  /** Optional additional actions */
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  }>;
  /** Variant for severity levels */
  variant?: "error" | "warning";
  /** Size modifier for different contexts */
  size?: "default" | "compact" | "inline";
  /** Additional CSS classes */
  className?: string;
  /** Whether to automatically focus the heading for accessibility */
  autoFocus?: boolean;
}

export const ErrorState = ({
  title,
  description,
  icon,
  onRetry,
  onResetFilters,
  actions,
  variant = "error",
  size = "default",
  className,
  autoFocus = false,
}: ErrorStateProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isInline = size === "inline";
  const isCompact = size === "compact";

  useEffect(() => {
    if (autoFocus && headingRef.current) {
      headingRef.current.focus();
    }
  }, [autoFocus]);

  const allActions = [
    ...(onRetry ? [{ label: "Retry", onClick: onRetry, variant: "default" as const }] : []),
    ...(onResetFilters ? [{ label: "Reset Filters", onClick: onResetFilters, variant: "outline" as const }] : []),
    ...(actions || []),
  ];

  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isInline ? "py-4" : isCompact ? "py-8" : "py-12",
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={cn(
          "mb-4",
          variant === "error" ? "text-destructive" : "text-amber-500",
          isInline ? "w-6 h-6" : "w-12 h-12"
        )}
        aria-hidden="true"
      >
        {icon || <AlertCircle className="w-full h-full" />}
      </div>
      <h3
        ref={headingRef}
        tabIndex={autoFocus ? -1 : undefined}
        className={cn(
          "font-semibold outline-none",
          isInline ? "text-sm" : "text-lg",
          variant === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "text-muted-foreground mt-2 max-w-md",
            isInline ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      )}
      {allActions.length > 0 && (
        <div className={cn("flex flex-wrap gap-2 justify-center", isInline ? "mt-3" : "mt-4")}>
          {allActions.map((action, index) => (
            <Button
              key={index}
              onClick={action.onClick}
              variant={action.variant || "outline"}
              size={isInline ? "sm" : "default"}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );

  if (isInline) {
    return content;
  }

  return (
    <Card
      className={cn(
        variant === "error"
          ? "border-destructive/50 bg-destructive/5"
          : "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
      )}
    >
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
};
