import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  /** Loading message to display */
  message?: string;
  /** Optional icon component (defaults to spinning RefreshCw) */
  icon?: ReactNode;
  /** Size modifier for different contexts */
  size?: "default" | "compact" | "inline";
  /** Additional CSS classes */
  className?: string;
}

export const LoadingState = ({
  message = "Loading...",
  icon,
  size = "default",
  className,
}: LoadingStateProps) => {
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
      aria-busy="true"
    >
      <div
        className={cn(
          "mb-4 text-muted-foreground",
          isInline ? "w-6 h-6" : "w-8 h-8"
        )}
        aria-hidden="true"
      >
        {icon || <RefreshCw className="w-full h-full animate-spin" />}
      </div>
      <p
        className={cn(
          "text-muted-foreground",
          isInline ? "text-xs" : "text-sm"
        )}
      >
        {message}
      </p>
      <span className="sr-only">{message}</span>
    </div>
  );

  if (isInline) {
    return content;
  }

  return (
    <Card>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
};
