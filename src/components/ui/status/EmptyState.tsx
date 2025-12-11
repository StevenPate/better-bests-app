import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Main heading for the empty state */
  title: string;
  /** Optional description providing more context */
  description?: string;
  /** Optional icon component to display */
  icon?: ReactNode;
  /** Optional action buttons */
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  }>;
  /** Variant for different styling contexts */
  variant?: "info" | "warning";
  /** Size modifier for different contexts */
  size?: "default" | "compact" | "inline";
  /** Additional CSS classes */
  className?: string;
}

export const EmptyState = ({
  title,
  description,
  icon,
  actions,
  variant = "info",
  size = "default",
  className,
}: EmptyStateProps) => {
  const isInline = size === "inline";
  const isCompact = size === "compact";

  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isInline ? "py-4" : isCompact ? "py-8" : "py-12",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {icon && (
        <div
          className={cn(
            "mb-4",
            variant === "warning" ? "text-amber-500" : "text-muted-foreground",
            isInline ? "w-6 h-6" : "w-12 h-12"
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          "font-semibold",
          isInline ? "text-sm" : "text-lg",
          variant === "warning" ? "text-amber-700 dark:text-amber-400" : "text-foreground"
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
      {actions && actions.length > 0 && (
        <div className={cn("flex gap-2", isInline ? "mt-3" : "mt-4")}>
          {actions.map((action, index) => (
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
    <Card className={variant === "warning" ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20" : ""}>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
};
