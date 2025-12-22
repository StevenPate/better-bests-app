import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calculator, MapPin, Globe, Zap, Map, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function Methodology() {
  const { year: yearParam } = useParams();
  const year = yearParam ? parseInt(yearParam) : 2025;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="outline" asChild className="mb-6">
          <Link to={`/review/${year}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Year in Review
          </Link>
        </Button>

        <div className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <Badge variant="secondary" className="text-sm">
              <Calculator className="w-4 h-4 mr-1" />
              Technical Documentation
            </Badge>
            <h1 className="text-4xl font-bold">Ranking Methodology</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A detailed explanation of how we calculate and rank books for the Year in Review
            </p>
          </div>

          {/* Scoring Formula */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" />
                Scoring Formula
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Each book earns points for every week it appears on a regional bestseller list.
                The formula uses logarithmic decay to emphasize top positions:
              </p>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                points = 100 × (1 - log(rank) / log(list_size + 1))
              </div>

              <p className="text-muted-foreground">
                This creates a curve where higher positions are rewarded exponentially more:
              </p>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-600">#1</div>
                  <div className="text-sm text-muted-foreground">≈ 100 points</div>
                </div>
                <div className="bg-slate-400/10 border border-slate-400/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-slate-500">#5</div>
                  <div className="text-sm text-muted-foreground">≈ 60 points</div>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-orange-600">#10</div>
                  <div className="text-sm text-muted-foreground">≈ 33 points</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* RSI Explanation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Regional Strength Index (RSI)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                RSI represents what percentage of a book's total performance came from a single region.
              </p>

              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RSI = 12.5%</span>
                  <span className="text-sm text-muted-foreground">Perfectly even across 9 regions</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RSI = 35%</span>
                  <span className="text-sm text-muted-foreground">Moderately regional</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RSI ≥ 45%</span>
                  <span className="text-sm text-muted-foreground">Strong regional concentration</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">RSI = 100%</span>
                  <span className="text-sm text-muted-foreground">Only appeared in one region</span>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="text-sm">
                  <strong>Example:</strong> If a book has a total score of 1,000 points across all regions,
                  and 450 of those points came from PNBA, then the RSI for PNBA = 0.45 (45%).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Category Explanations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                Ranking Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Most Regional */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">Most Regional Books</h3>
                </div>
                <p className="text-muted-foreground">
                  Books where one region made the biggest difference to their success. These are "regional darlings"
                  — books that hit it big but owe their success disproportionately to one area.
                </p>

                <div className="bg-muted/30 rounded-lg p-4 space-y-3 text-sm">
                  <h4 className="font-medium">Three-Stage Pool Algorithm:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li><strong>Stage 1:</strong> Top 100 books by total score (national hits)</li>
                    <li><strong>Stage 2:</strong> Top 10 per region by regional score (regional phenomena)</li>
                    <li><strong>Stage 3:</strong> All books with RSI ≥ 45% in any region (high regional dominance)</li>
                  </ol>

                  <h4 className="font-medium mt-4">Filtering:</h4>
                  <p className="text-muted-foreground">
                    Books with max RSI ≤ 35% are excluded (too evenly distributed to be "regional").
                  </p>

                  <h4 className="font-medium mt-4">Assignment:</h4>
                  <p className="text-muted-foreground">
                    Each book is assigned to the region where it has the highest RSI. A book can only appear
                    in one region's list to prevent duplicates.
                  </p>

                  <h4 className="font-medium mt-4">Ranking Formula:</h4>
                  <div className="bg-background rounded p-2 font-mono text-xs">
                    weighted_score = regional_score × RSI_boost
                    <br />
                    RSI_boost = 1.0 + ((RSI - 0.35) / 0.65) × 0.5
                  </div>
                  <p className="text-muted-foreground mt-2">
                    This creates a boost from 1.0x at 35% RSI to 1.5x at 100% RSI, rewarding books that are
                    truly "owned" by their region.
                  </p>
                </div>
              </div>

              {/* Regional Top 10s */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Map className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">Regional Top 10s</h3>
                </div>
                <p className="text-muted-foreground">
                  The best performing books in each specific region, ranked by their regional score.
                </p>
                <div className="bg-muted/30 rounded-lg p-4 text-sm">
                  <p className="text-muted-foreground">
                    Simple ranking: filter by region, order by <code className="bg-background px-1 rounded">regional_score</code> descending,
                    take top 10. Shows weeks on chart, best rank achieved, and RSI for that region.
                  </p>
                </div>
              </div>

              {/* Most National */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">Most National Books</h3>
                </div>
                <p className="text-muted-foreground">
                  Books that performed consistently across ALL regions — true national bestsellers with no regional bias.
                </p>

                <div className="bg-muted/30 rounded-lg p-4 space-y-3 text-sm">
                  <h4 className="font-medium">Criteria:</h4>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Must appear in at least 5 of 9 regions</li>
                    <li>Ranked by RSI variance (lowest first)</li>
                  </ul>

                  <h4 className="font-medium mt-4">RSI Variance:</h4>
                  <p className="text-muted-foreground">
                    The statistical variance of RSI values across regions. Lower variance means more even distribution.
                  </p>

                  <div className="bg-primary/5 border border-primary/20 rounded p-3 mt-2">
                    <p className="text-sm">
                      <strong>Example:</strong> A book with RSI [0.12, 0.13, 0.11, 0.14, 0.12, 0.13, 0.12, 0.13]
                      has very low variance and ranks high in "Most National."
                    </p>
                  </div>
                </div>
              </div>

              {/* Most Efficient */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-lg">Most Efficient Performers</h3>
                </div>
                <p className="text-muted-foreground">
                  Books with the highest "quality over quantity" — best average score per week on the charts.
                </p>

                <div className="bg-muted/30 rounded-lg p-4 space-y-3 text-sm">
                  <h4 className="font-medium">Criteria:</h4>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Must have at least 4 weeks on chart (filters out one-hit wonders)</li>
                    <li>Ranked by average score per week (highest first)</li>
                  </ul>

                  <h4 className="font-medium mt-4">Formula:</h4>
                  <div className="bg-background rounded p-2 font-mono text-xs">
                    avg_score_per_week = total_score / weeks_on_chart
                  </div>

                  <div className="bg-primary/5 border border-primary/20 rounded p-3 mt-2">
                    <p className="text-sm">
                      <strong>Why it matters:</strong> A book that was #1 for 4 weeks will have higher efficiency
                      than a book that was #8 for 20 weeks. This highlights books that dominated when they appeared.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Data Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Rankings include all {year} appearances across 9 regional indie bookseller associations:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['PNBA', 'CALIBA (NorCal)', 'CALIBA (SoCal)', 'GLIBA', 'MPIBA', 'MIBA', 'NAIBA', 'NEIBA', 'SIBA'].map((region) => (
                  <Badge key={region} variant="outline" className="justify-center py-2">
                    {region}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 font-medium">Category</th>
                      <th className="text-left py-3 px-2 font-medium">What It Finds</th>
                      <th className="text-left py-3 px-2 font-medium">Primary Sort</th>
                      <th className="text-left py-3 px-2 font-medium">Key Filter</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-2 font-medium text-foreground">Regional Top 10s</td>
                      <td className="py-3 px-2">Best in each region</td>
                      <td className="py-3 px-2"><code className="text-xs bg-muted px-1 rounded">regional_score</code> DESC</td>
                      <td className="py-3 px-2">By region</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-2 font-medium text-foreground">Most Regional</td>
                      <td className="py-3 px-2">Regional darlings</td>
                      <td className="py-3 px-2"><code className="text-xs bg-muted px-1 rounded">score × RSI_boost</code> DESC</td>
                      <td className="py-3 px-2">max RSI &gt; 0.35</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-3 px-2 font-medium text-foreground">Most National</td>
                      <td className="py-3 px-2">True national hits</td>
                      <td className="py-3 px-2"><code className="text-xs bg-muted px-1 rounded">rsi_variance</code> ASC</td>
                      <td className="py-3 px-2">≥5 regions</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-2 font-medium text-foreground">Most Efficient</td>
                      <td className="py-3 px-2">Quality over quantity</td>
                      <td className="py-3 px-2"><code className="text-xs bg-muted px-1 rounded">avg_score_per_week</code> DESC</td>
                      <td className="py-3 px-2">≥4 weeks</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Back button */}
          <div className="text-center pt-4">
            <Button variant="outline" asChild>
              <Link to={`/review/${year}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Year in Review
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
