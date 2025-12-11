import { Link } from 'react-router-dom';
import { Calculator, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

interface MethodologyFooterProps {
  year: number;
}

export function MethodologyFooter({ year }: MethodologyFooterProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Calculator className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">How are rankings calculated?</h3>
              <p className="text-sm text-muted-foreground">
                Learn about our scoring methodology and metrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <Info className="w-4 h-4 mr-2" />
                {isOpen ? 'Hide' : 'Quick'} Overview
              </Button>
            </CollapsibleTrigger>

            <Button variant="outline" size="sm" asChild>
              <Link to={`/review/${year}/methodology`}>
                Full Details
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-medium text-sm mb-2">Scoring</h4>
              <p className="text-xs text-muted-foreground">
                Points awarded per week using logarithmic decay. #1 ≈ 100 pts, #5 ≈ 60 pts, #10 ≈ 33 pts.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-medium text-sm mb-2">Regional Strength (RSI)</h4>
              <p className="text-xs text-muted-foreground">
                Percentage of a book's total score from one region. Higher RSI = stronger regional identity.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-medium text-sm mb-2">Most Regional</h4>
              <p className="text-xs text-muted-foreground">
                Books weighted by regional_score × RSI boost. Rewards books "owned" by one region.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-medium text-sm mb-2">Most National</h4>
              <p className="text-xs text-muted-foreground">
                Books with lowest RSI variance across 5+ regions. True nationwide bestsellers.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
