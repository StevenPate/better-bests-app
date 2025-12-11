// src/components/Navigation/RegionSelector.tsx
import { Check, ChevronDown } from 'lucide-react';
import { useRegion } from '@/hooks/useRegion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RegionSelectorProps {
  disabled?: boolean;
  tooltip?: string;
}

export function RegionSelector({ disabled = false, tooltip }: RegionSelectorProps) {
  const { currentRegion, regions, switchRegion } = useRegion();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={disabled}
          title={tooltip}
        >
          <span className="font-semibold">{currentRegion.abbreviation}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {regions.map((region) => (
          <DropdownMenuItem
            key={region.abbreviation}
            onClick={() => switchRegion(region.abbreviation, true)}
            className="cursor-pointer"
          >
            <Check
              className={cn(
                'mr-2 h-4 w-4',
                currentRegion.abbreviation === region.abbreviation
                  ? 'opacity-100'
                  : 'opacity-0'
              )}
            />
            <div className="flex flex-col">
              <span className="font-medium">{region.display_name}</span>
              <span className="text-xs text-muted-foreground">{region.full_name}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
