import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface YearTabsProps {
  availableYears: number[];
  currentYear: number;
}

export function YearTabs({ availableYears, currentYear }: YearTabsProps) {
  const navigate = useNavigate();

  return (
    <div role="tablist" className="flex gap-2 justify-center">
      {availableYears.map((year) => {
        const isActive = year === currentYear;
        return (
          <button
            key={year}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) navigate(`/review/${year}`);
            }}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
