import { MapPin, Globe, Zap, Map } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RankingCategory } from '@/types/performance';

type CategoryType = RankingCategory | 'overview';

interface Category {
  id: CategoryType;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const CATEGORIES: Category[] = [
  {
    id: 'most_regional',
    label: 'Most Regional',
    shortLabel: 'Regional',
    icon: MapPin,
    description: 'Books with strongest regional identity',
  },
  {
    id: 'regional_top10s',
    label: 'Regional Top 10s',
    shortLabel: 'Top 10s',
    icon: Map,
    description: 'Best performers by region',
  },
  {
    id: 'most_national',
    label: 'Most National',
    shortLabel: 'National',
    icon: Globe,
    description: 'Consistent performers across all regions',
  },
  {
    id: 'most_efficient',
    label: 'Most Efficient',
    shortLabel: 'Efficient',
    icon: Zap,
    description: 'Highest average score per week on chart (min. 4 weeks)',
  },
];

interface CategoryNavProps {
  activeCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
}

export function CategoryNav({ activeCategory, onCategoryChange }: CategoryNavProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border py-3 -mx-4 px-4 md:-mx-0 md:px-0 md:border md:rounded-lg">
      <nav className="flex gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          const isActive = activeCategory === category.id;

          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                'hover:bg-accent/50',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{category.label}</span>
              <span className="sm:hidden">{category.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function getCategoryInfo(categoryId: CategoryType): Category | undefined {
  return CATEGORIES.find((c) => c.id === categoryId);
}

export { CATEGORIES };
export type { CategoryType };
