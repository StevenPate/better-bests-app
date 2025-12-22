import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

export function MethodologyCard() {
  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>How We Calculate Rankings</CardTitle>
            <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <h4>Scoring Formula</h4>
            <p>
              Each book earns points for every week it appears on a regional list.
              The formula uses logarithmic decay to emphasize top positions:
            </p>
            <code className="block bg-muted p-2 rounded my-2">
              points = 100 × (1 - log(rank) / log(list_size + 1))
            </code>
            <ul>
              <li>#1 position earns ~100 points</li>
              <li>#5 position earns ~60 points</li>
              <li>#10 position earns ~33 points</li>
            </ul>

            <h4>Key Metrics</h4>
            <dl>
              <dt className="font-semibold">Total Score</dt>
              <dd>Sum of all weekly points across all regions. Primary "Book of the Year" metric.</dd>

              <dt className="font-semibold mt-2">Regional Strength Index (RSI)</dt>
              <dd>Percentage of a book's total performance from each region (0-100%).</dd>

              <dt className="font-semibold mt-2">Average Score Per Week</dt>
              <dd>Total score divided by weeks on chart. Reveals "quality over quantity" performers.</dd>
            </dl>

            <h4>Ranking Categories</h4>
            <ul>
              <li><strong>Regional Top 10s:</strong> Best performers in each region by regional score</li>
              <li><strong>Most Regional:</strong> Books with highest single-region RSI (regional darlings)</li>
              <li><strong>Most National:</strong> Books with most even RSI distribution across regions</li>
              <li><strong>Most Efficient:</strong> Books with highest average score per week</li>
            </ul>

            <p className="text-xs text-muted-foreground mt-4">
              Data includes all 2025 appearances across 9 regional indie bookseller associations:
              PNBA, Northern California, Southern California, GLIBA, MPIBA, MIBA, NAIBA, NEIBA, and SIBA.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
