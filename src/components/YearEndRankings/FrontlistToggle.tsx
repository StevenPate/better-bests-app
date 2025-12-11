import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

interface FrontlistToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isLoading?: boolean;
}

export function FrontlistToggle({ enabled, onToggle, isLoading }: FrontlistToggleProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <Label htmlFor="frontlist-toggle" className="text-sm font-medium cursor-pointer">
          Frontlist Only
        </Label>
      </div>

      <Switch
        id="frontlist-toggle"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={isLoading}
      />

      {enabled && (
        <Badge variant="secondary" className="text-xs">
          2024-2025
        </Badge>
      )}

      {isLoading && (
        <span className="text-xs text-muted-foreground">Loading...</span>
      )}
    </div>
  );
}
