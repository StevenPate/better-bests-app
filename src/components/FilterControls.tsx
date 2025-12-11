import { Filter, Users, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

interface FilterControlsProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  audienceFilter: string;
  onAudienceFilterChange: (value: string) => void;
  isPbnStaff: boolean;
}

export const FilterControls = ({
  searchTerm,
  onSearchChange,
  filter,
  onFilterChange,
  audienceFilter,
  onAudienceFilterChange,
  isPbnStaff
}: FilterControlsProps) => {
  const isMobile = useIsMobile();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className={isMobile ? "flex flex-col gap-4" : "flex flex-wrap items-center gap-4"}>
          {/* Search */}
          <div className={`relative ${isMobile ? "w-full" : "flex-1 min-w-[300px]"}`}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, author, or ISBN..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
              aria-label="Search bestseller list by title, author, or ISBN"
            />
          </div>
          
          {/* Filters */}
          <div className={isMobile ? "flex flex-col gap-4 w-full" : "flex gap-4"}>
            <Select value={filter} onValueChange={onFilterChange}>
              <SelectTrigger
                className={`${isMobile ? "w-full" : "w-48"} text-muted-foreground ${filter !== 'all' ? 'border-primary border-2' : 'border-muted-foreground/30'}`}
                aria-label="Filter bestseller list by adds, drops, or all items"
              >
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="adds">Just adds</SelectItem>
                <SelectItem value="drops">Just drops</SelectItem>
                <SelectItem value="adds-drops">Just adds and drops</SelectItem>
                <SelectItem value="no-drops">No drops</SelectItem>
              </SelectContent>
            </Select> 
            {isPbnStaff && (
              <Select value={audienceFilter} onValueChange={onAudienceFilterChange}>
                <SelectTrigger
                  className={`${isMobile ? "w-full" : "w-48"} text-muted-foreground ${audienceFilter !== 'all' ? 'border-primary border-2' : 'border-muted-foreground/30'}`}
                  aria-label="Filter by audience (Adult, Teen, Children, or all)"
                >
                  <Users className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">View all audiences</SelectItem>
                  <SelectItem value="A">Adult</SelectItem>
                  <SelectItem value="T">Teen</SelectItem>
                  <SelectItem value="C">Children</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};