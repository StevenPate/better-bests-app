import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AudienceType } from '@/hooks/useAudiencesByIsbn';

export type AudienceFilterValue = AudienceType | 'all';

interface AudienceFilterProps {
  value: AudienceFilterValue;
  onChange: (value: AudienceFilterValue) => void;
  isLoading?: boolean;
  audienceCount?: { adult: number; teen: number; children: number };
}

const AUDIENCE_LABELS: Record<AudienceFilterValue, string> = {
  all: 'All Audiences',
  A: 'Adult',
  T: 'Teen',
  C: "Children's",
};

export function AudienceFilter({
  value,
  onChange,
  isLoading = false,
  audienceCount,
}: AudienceFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <Users className="w-4 h-4 text-muted-foreground" />
      <Select
        value={value}
        onValueChange={(v) => onChange(v as AudienceFilterValue)}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[160px] h-9">
          <SelectValue placeholder="Filter by audience" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="flex items-center gap-2">
              All Audiences
              {audienceCount && (
                <Badge variant="secondary" className="text-xs">
                  {audienceCount.adult + audienceCount.teen + audienceCount.children}
                </Badge>
              )}
            </span>
          </SelectItem>
          <SelectItem value="A">
            <span className="flex items-center gap-2">
              Adult
              {audienceCount && (
                <Badge variant="secondary" className="text-xs">
                  {audienceCount.adult}
                </Badge>
              )}
            </span>
          </SelectItem>
          <SelectItem value="T">
            <span className="flex items-center gap-2">
              Teen
              {audienceCount && (
                <Badge variant="secondary" className="text-xs">
                  {audienceCount.teen}
                </Badge>
              )}
            </span>
          </SelectItem>
          <SelectItem value="C">
            <span className="flex items-center gap-2">
              Children's
              {audienceCount && (
                <Badge variant="secondary" className="text-xs">
                  {audienceCount.children}
                </Badge>
              )}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {isLoading && (
        <Badge variant="outline" className="text-xs animate-pulse">
          Loading...
        </Badge>
      )}
    </div>
  );
}
