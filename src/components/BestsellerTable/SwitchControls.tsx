import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { SwitchControlsProps } from './types';

/**
 * Renders a switch control (POS or Shelf) with loading and status indicators
 */
export const SwitchControls: React.FC<SwitchControlsProps> = ({
  type,
  checked,
  disabled,
  pending,
  status,
  bookTitle,
  isMobile,
  onChange
}) => {
  const ariaLabel = disabled
    ? `${type.toUpperCase()} switch loading, please wait`
    : `Toggle ${type.toUpperCase()} for ${bookTitle}`;

  const cellClasses = isMobile ? 'p-2' : '';

  return (
    <div className={`flex justify-center ${cellClasses}`}>
      <div className="flex items-center gap-2" aria-live="polite">
        <Checkbox
          checked={checked}
          onCheckedChange={(checked) => onChange(checked as boolean)}
          className="h-4 w-4 rounded-sm border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          disabled={disabled}
          aria-label={ariaLabel}
        />
        {pending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        {!pending && status === 'success' && (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
        )}
        {!pending && status === 'error' && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
        )}
      </div>
    </div>
  );
};
