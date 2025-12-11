# BookChart - Regional Heat Map

GitHub-style heat map visualization showing book performance across all regional bestseller lists.

## Components

### `<RegionalHeatMap />`
Main component that displays the complete heat map widget with responsive layouts.

**Props:**
- `isbn: string` - The book's ISBN to fetch regional data for

**Usage:**
```tsx
import { RegionalHeatMap } from '@/components/BookChart';

<RegionalHeatMap isbn="9780000000000" />
```

**Features:**
- Responsive design with desktop grid and mobile accordion layouts
- Automatic time range selection (26 weeks, 52 weeks, All history)
- Loading states with skeleton UI
- Empty states with helpful messages
- Overflow handling for long data sets

### `<HeatMapGrid />`
Desktop layout component that renders region rows with perfect vertical alignment using unified CSS Grid.

**Key Features:**
- Unified CSS Grid ensures cells align vertically across all rows
- Responsive cell sizing: 12px squares (26 weeks) or 8px bars (52 weeks)
- Horizontal scrolling for 52-week view
- Aggregate row showing combined performance

### `<HeatMapAccordion />`
Mobile layout component using collapsible accordions for each region.

**Key Features:**
- Always uses 8px wide vertical bars for consistency
- Horizontal scrolling within each accordion panel
- Auto-scrolls to show most recent week first
- Gradient indicators for scroll affordance
- Summary stats in accordion headers

### `<RegionRow />`
Displays a single region's performance across weeks in the desktop grid.

**Features:**
- Region label with short names (PNBA, NorCal, SoCal, etc.)
- Heat map cells aligned in unified grid
- Regional statistics (weeks on list, best rank, avg rank)

### `<HeatMapCell />`
Individual cell representing one week in one region.

**Props:**
- `weekData: RegionalWeekData | null` - Data for this week/region
- `weekDate: string` - ISO date string (YYYY-MM-DD)
- `size: 'small' | 'large'` - Cell size variant

**Features:**
- Tooltip on hover/focus with week, rank, category, and list details
- Keyboard navigable with focus indicators
- Responsive sizing based on time range

### `<TimeRangeSelector />`
Tabs for selecting 26 weeks / 52 weeks / All history.

**Features:**
- Three options: 26 weeks, 52 weeks, All history
- Responsive layout (stacked on mobile, inline on desktop)
- State managed by parent component

### `<HeatMapLegend />`
Color scale legend explaining rank colors.

**Design:**
- Colored badges with rank ranges
- Horizontal layout
- Dark mode compatible

### `<RegionalStats />`
Summary statistics displayed inline.

**Displays:**
- Weeks on list (e.g., "1w")
- Best rank (e.g., "#1")
- Average rank (e.g., "avg 5")

### `<AggregateRow />`
Combined performance across all regions, labeled as "Avg."

**Features:**
- Shows best rank across all regions for each week
- Total weeks and active region count
- Top-aligned label for multi-line stats
- Border separator from region rows

## Data Hook

### `useRegionalHistory()`
React Query hook that fetches regional bestseller data from Supabase.

**Options:**
```typescript
{
  isbn: string;
  weeks: 26 | 52 | 'all';
}
```

**Returns:**
```typescript
{
  data: Map<string, RegionalWeekData[]> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

**Features:**
- Automatic caching with React Query
- Error handling with fallback UI
- Loading states
- Refetch capability

## Utilities

### `getRankColor(rank: number | null): string`
Maps rank to Tailwind color class.

**Returns:**
- `bg-emerald-700 text-white` - Ranks 1-5
- `bg-emerald-500 text-white` - Ranks 6-10
- `bg-emerald-300 text-emerald-900` - Ranks 11-20
- `bg-muted text-muted-foreground` - Not on list

### `calculateRegionalStats(data: RegionalWeekData[]): RegionalStats`
Computes weeks on list, best rank, and average rank for a region.

**Parameters:**
- `data: RegionalWeekData[]` - Array of week data for one region

**Returns:**
```typescript
{
  weeksOnList: number;
  bestRank: number;
  averageRank: number;
}
```

### `generateWeekDates(range: TimeRange): string[]`
Generates ISO date strings for the selected time range.

**Parameters:**
- `range: 26 | 52 | 'all'` - Number of weeks to generate

**Returns:**
- Array of ISO date strings (YYYY-MM-DD format)
- Dates are Wednesdays (PNBA list day)
- Newest dates first

### `getShortRegionLabel(region: string): string`
Maps full region codes to short display labels.

**Mapping:**
- PNBA → PNBA
- CALIBAN → NorCal
- CALIBAS → SoCal
- GLIBA → GLIBA
- MPIBA → MPIBA
- NAIBA → NAIBA
- NEIBA → NEIBA
- SIBA → SIBA

## Responsive Design

### Desktop (md and up)
- `<HeatMapGrid />` with full grid layout
- 26 weeks: 12px × 12px squares
- 52 weeks: 8px × 12px vertical bars with horizontal scroll
- Unified CSS Grid for perfect vertical alignment
- Region labels, heat map cells, and stats in aligned columns

### Mobile (below md)
- `<HeatMapAccordion />` with collapsible panels
- Always uses 8px × 12px vertical bars
- Horizontal scrolling within accordion panels
- Auto-scrolls to show most recent week
- Stats in accordion headers (no duplication in content)

### Overflow Handling
- Desktop 52 weeks: Horizontal scroll on grid container
- Mobile: Horizontal scroll within accordion panels
- Multiple containment layers prevent page-wide overflow
- Scroll gradients for visual affordance

## Accessibility

- Full keyboard navigation (Tab, Arrow keys)
- ARIA grid/row/gridcell/rowheader roles
- Descriptive aria-labels on all interactive elements
- Focus indicators with ring-2 and ring-primary
- Screen reader compatible with meaningful labels
- Tooltip content announced to screen readers

## Color Scale

- **Dark green** (`bg-emerald-700`): Ranks 1-5 (top tier)
- **Medium green** (`bg-emerald-500`): Ranks 6-10 (strong)
- **Light green** (`bg-emerald-300`): Ranks 11-20 (on list)
- **Gray** (`bg-muted`): Not on list

## Architecture Notes

### Grid Alignment Solution
The desktop grid uses a **unified CSS Grid** approach where the parent container defines all column positions:

```css
grid-template-columns: 5rem repeat(52, 0.5rem) 1fr
```

Each child component (RegionRow, AggregateRow) returns a fragment with direct children that participate in the parent grid. This ensures perfect vertical alignment across all rows.

### Mobile Scroll Behavior
The mobile accordion uses `scrollLeft = scrollWidth` on mount to automatically position the user at the most recent week. Users can scroll left to see historical data.

### Overflow Containment Chain
Multiple layers prevent layout breaking:
1. CardContent: `overflow-hidden`
2. Accordion: `min-w-0`
3. AccordionItem: `overflow-hidden`
4. Content container: `overflow-hidden`
5. Scrollable grid: `overflow-x-auto` with `maxWidth: 100%`

## Known Limitations

- Mobile accordion UI needs refinement for production
- 406 errors from Supabase indicate `book_positions` table schema needs investigation
- "All history" mode not yet implemented (falls back to 52 weeks)

## Testing

Run component tests:
```bash
npm test -- BookChart
```

Target coverage: 80%+ on utils, 60%+ on components

## Design Reference

See: `docs/plans/2025-11-07-regional-heat-map-design.md`
