# Review Page Multi-Year Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the review/awards pages to support multiple years with automatic year detection, year tabs, dynamic stats, and YTD disclaimers.

**Architecture:** Minimal UI refactor. The database already partitions by year. Two new hooks query available years and per-year stats. A new YearTabs component provides navigation. HeroSection and CategoryContent gain conditional rendering based on whether the year is complete or in-progress.

**Tech Stack:** React, TypeScript, Vite, React Router, React Query, Supabase, Vitest, Testing Library

---

### Task 1: Create `useAvailableYears` hook

**Files:**
- Create: `src/hooks/useAvailableYears.ts`
- Test: `src/hooks/useAvailableYears.test.ts`

**Step 1: Write the failing test**

```typescript
// src/hooks/useAvailableYears.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => Promise.resolve({ data: [{ year: 2025 }, { year: 2026 }], error: null }));
  return {
    supabase: {
      from: vi.fn(() => builder),
    },
  };
});

import { useAvailableYears } from './useAvailableYears';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAvailableYears', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return sorted array of available years', async () => {
    const { result } = renderHook(() => useAvailableYears(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([2025, 2026]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useAvailableYears.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/hooks/useAvailableYears.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function fetchAvailableYears(): Promise<number[]> {
  const { data, error } = await supabase
    .from('book_performance_metrics')
    .select('year')
    .order('year', { ascending: true });

  if (error) throw error;

  const years = [...new Set(data.map((row: { year: number }) => row.year))];
  return years;
}

export function useAvailableYears() {
  return useQuery({
    queryKey: ['availableYears'],
    queryFn: fetchAvailableYears,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useAvailableYears.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/useAvailableYears.ts src/hooks/useAvailableYears.test.ts
git commit -m "feat: add useAvailableYears hook for multi-year review support"
```

---

### Task 2: Create `useYearStats` hook

**Files:**
- Create: `src/hooks/useYearStats.ts`
- Test: `src/hooks/useYearStats.test.ts`

**Step 1: Write the failing test**

```typescript
// src/hooks/useYearStats.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: (...args: any[]) => mockFrom(...args),
    },
  };
});

import { useYearStats } from './useYearStats';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useYearStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock weekly_scores query (week count)
    const weekBuilder: any = {};
    weekBuilder.select = vi.fn(() => weekBuilder);
    weekBuilder.eq = vi.fn(() => weekBuilder);
    weekBuilder.gte = vi.fn(() => weekBuilder);
    weekBuilder.lt = vi.fn(() => Promise.resolve({
      data: [
        { week_date: '2026-01-07' },
        { week_date: '2026-01-14' },
        { week_date: '2026-01-21' },
        { week_date: '2026-01-28' },
        { week_date: '2026-02-04' },
        { week_date: '2026-02-11' },
        { week_date: '2026-02-18' },
      ],
      error: null,
    }));

    // Mock book_performance_metrics query (book count)
    const bookBuilder: any = {};
    bookBuilder.select = vi.fn(() => bookBuilder);
    bookBuilder.eq = vi.fn(() => Promise.resolve({
      data: Array.from({ length: 423 }, (_, i) => ({ isbn: `isbn-${i}` })),
      error: null,
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'weekly_scores') return weekBuilder;
      if (table === 'book_performance_metrics') return bookBuilder;
      return weekBuilder;
    });
  });

  it('should return week count and book count for a year', async () => {
    const { result } = renderHook(() => useYearStats(2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ weeksOfData: 7, totalBooks: 423 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useYearStats.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/hooks/useYearStats.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface YearStats {
  weeksOfData: number;
  totalBooks: number;
}

async function fetchYearStats(year: number): Promise<YearStats> {
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;

  const [weeksResult, booksResult] = await Promise.all([
    supabase
      .from('weekly_scores')
      .select('week_date')
      .gte('week_date', startDate)
      .lt('week_date', endDate),
    supabase
      .from('book_performance_metrics')
      .select('isbn')
      .eq('year', year),
  ]);

  if (weeksResult.error) throw weeksResult.error;
  if (booksResult.error) throw booksResult.error;

  const uniqueWeeks = new Set(weeksResult.data.map((row: { week_date: string }) => row.week_date));
  const uniqueBooks = new Set(booksResult.data.map((row: { isbn: string }) => row.isbn));

  return {
    weeksOfData: uniqueWeeks.size,
    totalBooks: uniqueBooks.size,
  };
}

export function useYearStats(year: number) {
  return useQuery({
    queryKey: ['yearStats', year],
    queryFn: () => fetchYearStats(year),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useYearStats.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/useYearStats.ts src/hooks/useYearStats.test.ts
git commit -m "feat: add useYearStats hook for dynamic week/book counts"
```

---

### Task 3: Create `YearTabs` component

**Files:**
- Create: `src/components/YearEndRankings/YearTabs.tsx`
- Test: `src/components/YearEndRankings/YearTabs.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/components/YearEndRankings/YearTabs.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { YearTabs } from './YearTabs';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('YearTabs', () => {
  it('should render a tab for each available year', () => {
    render(
      <MemoryRouter>
        <YearTabs availableYears={[2025, 2026]} currentYear={2026} />
      </MemoryRouter>
    );

    expect(screen.getByRole('tab', { name: '2025' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2026' })).toBeInTheDocument();
  });

  it('should highlight the current year tab', () => {
    render(
      <MemoryRouter>
        <YearTabs availableYears={[2025, 2026]} currentYear={2026} />
      </MemoryRouter>
    );

    const activeTab = screen.getByRole('tab', { name: '2026' });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should navigate when clicking a different year tab', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <YearTabs availableYears={[2025, 2026]} currentYear={2026} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('tab', { name: '2025' }));
    expect(mockNavigate).toHaveBeenCalledWith('/review/2025');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/YearEndRankings/YearTabs.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// src/components/YearEndRankings/YearTabs.tsx
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/YearEndRankings/YearTabs.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/YearEndRankings/YearTabs.tsx src/components/YearEndRankings/YearTabs.test.tsx
git commit -m "feat: add YearTabs component for year navigation"
```

---

### Task 4: Update `HeroSection` with `isComplete` support

**Files:**
- Modify: `src/components/YearEndRankings/HeroSection.tsx`
- Test: `src/components/YearEndRankings/HeroSection.test.tsx` (create)

**Step 1: Write the failing test**

```tsx
// src/components/YearEndRankings/HeroSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSection } from './HeroSection';

describe('HeroSection', () => {
  it('should show "Year to Date" badge for incomplete year', () => {
    render(
      <HeroSection
        year={2026}
        isComplete={false}
        stats={{ totalRegions: 9, totalWeeks: 7, totalBooks: 423 }}
      />
    );

    expect(screen.getByText('2026 Year to Date')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Weeks So Far')).toBeInTheDocument();
  });

  it('should show plain year badge for complete year', () => {
    render(
      <HeroSection
        year={2025}
        isComplete={true}
        stats={{ totalRegions: 9, totalWeeks: 52, totalBooks: 847 }}
      />
    );

    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('Weeks')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/YearEndRankings/HeroSection.test.tsx`
Expected: FAIL — `isComplete` prop not accepted / "Year to Date" text not found

**Step 3: Update HeroSection implementation**

Modify `src/components/YearEndRankings/HeroSection.tsx`:

1. Add `isComplete` to `HeroSectionProps` interface (default `true`):
   ```typescript
   interface HeroSectionProps {
     year: number;
     isComplete?: boolean;
     stats?: {
       totalBooks?: number;
       totalWeeks?: number;
       totalRegions?: number;
     };
   }
   ```

2. Update the function signature:
   ```typescript
   export function HeroSection({ year, isComplete = true, stats }: HeroSectionProps) {
   ```

3. Change the year badge `<span>` (currently line 33):
   - From: `<span>{year}</span>`
   - To: `<span>{isComplete ? year : `${year} Year to Date`}</span>`

4. Change the weeks subtext (currently line 63, `<div className="text-xs text-muted-foreground">Weeks</div>`):
   - From: `Weeks`
   - To: `{isComplete ? 'Weeks' : 'Weeks So Far'}`

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/YearEndRankings/HeroSection.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/YearEndRankings/HeroSection.tsx src/components/YearEndRankings/HeroSection.test.tsx
git commit -m "feat: add isComplete prop to HeroSection for YTD display"
```

---

### Task 5: Update routing — dynamic year detection

**Files:**
- Modify: `src/App.tsx` (lines 96-98: `ReviewDefaultRedirect`)
- Modify: `src/hooks/useYearEndRankings.ts` (line 415: default year param)
- Test: `src/App.test.tsx` (update existing test if needed)

**Step 1: Update `ReviewDefaultRedirect` in `src/App.tsx`**

Change lines 96-98 from:
```typescript
const ReviewDefaultRedirect = () => {
  return <Navigate to="/review/2025" replace />;
};
```
To:
```typescript
const ReviewDefaultRedirect = () => {
  return <Navigate to={`/review/${new Date().getFullYear()}`} replace />;
};
```

Also update the JSDoc comment above it (lines 82-95) to remove the hardcoded "2025" reference:
- Change line 85: `Redirects `/review` to `/review/{currentYear}` (dynamically detected)`

**Step 2: Update default year in `useYearEndRankings`**

In `src/hooks/useYearEndRankings.ts`, change line 415 from:
```typescript
export function useYearEndRankings(
  category: RankingCategory,
  year: number = 2025,
```
To:
```typescript
export function useYearEndRankings(
  category: RankingCategory,
  year: number = new Date().getFullYear(),
```

**Step 3: Run existing tests to verify nothing breaks**

Run: `npx vitest run src/App.test.tsx src/hooks/useYearEndRankings.ts`
Expected: PASS (existing routing tests should still work)

**Step 4: Commit**

```bash
git add src/App.tsx src/hooks/useYearEndRankings.ts
git commit -m "feat: dynamic year detection for review page routing"
```

---

### Task 6: Integrate everything in `Awards.tsx`

**Files:**
- Modify: `src/pages/Awards.tsx`

This is the main integration task. Changes to `Awards.tsx`:

**Step 1: Add imports**

At the top of `src/pages/Awards.tsx`, add:
```typescript
import { useAvailableYears } from '@/hooks/useAvailableYears';
import { useYearStats } from '@/hooks/useYearStats';
import { YearTabs } from '@/components/YearEndRankings/YearTabs';
import { Info } from 'lucide-react';
```

**Step 2: Make `FRONTLIST_YEARS` dynamic**

Change line 46 from:
```typescript
const FRONTLIST_YEARS = [2024, 2025];
```
To:
```typescript
const currentYear = new Date().getFullYear();
const FRONTLIST_YEARS = [currentYear - 1, currentYear];
```

**Step 3: Update the `Awards` component body**

Inside the `Awards` function (after the existing `year` variable on line 286), add:
```typescript
const currentYear = new Date().getFullYear();
const isComplete = year < currentYear;
const { data: availableYears } = useAvailableYears();
const { data: yearStats } = useYearStats(year);
```

**Step 4: Change the default year fallback**

Change line 286 from:
```typescript
const year = yearParam ? parseInt(yearParam) : 2025;
```
To:
```typescript
const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
```

**Step 5: Add YearTabs to JSX**

In the return JSX, after the `</header>` closing tag (after line 447) and before the container div (line 449), add the YearTabs:
```tsx
{/* Year Tabs */}
{availableYears && availableYears.length > 1 && (
  <div className="container mx-auto px-4 pt-6 max-w-6xl">
    <YearTabs availableYears={availableYears} currentYear={year} />
  </div>
)}
```

**Step 6: Update HeroSection props**

Change the HeroSection call (lines 451-458) from:
```tsx
<HeroSection
  year={year}
  stats={{
    totalRegions: 9,
    totalWeeks: 52,
    totalBooks: 847,
  }}
/>
```
To:
```tsx
<HeroSection
  year={year}
  isComplete={isComplete}
  stats={{
    totalRegions: 9,
    totalWeeks: yearStats?.weeksOfData ?? 52,
    totalBooks: yearStats?.totalBooks ?? 0,
  }}
/>
```

**Step 7: Add disclaimer to `CategoryContent`**

Add `isComplete` and `weeksOfData` props to the `CategoryContentProps` interface:
```typescript
interface CategoryContentProps {
  // ... existing props
  isComplete: boolean;
  weeksOfData: number;
}
```

In each category section inside `CategoryContent`, after the description `<p>` tag, add:
```tsx
{!isComplete && weeksOfData < 52 && (
  <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
    <Info className="w-4 h-4" />
    Based on {weeksOfData} weeks of data. Rankings may shift as the year progresses.
  </p>
)}
```

This needs to be added in four places inside `CategoryContent`:
1. Inside `most_regional` block — after the description div (around line 156)
2. Inside `regional_top10s` block — after the description div (around line 199)
3. Inside `most_national` block — after the description div (around line 245)
4. Inside `most_efficient` block — after the description div (around line 267)

**Step 8: Pass new props to CategoryContent**

Update the `<CategoryContent>` call (around line 480) to include:
```tsx
isComplete={isComplete}
weeksOfData={yearStats?.weeksOfData ?? 52}
```

**Step 9: Run all tests**

Run: `npx vitest run`
Expected: All existing tests PASS

**Step 10: Manual verification**

Run: `npm run dev`
- Visit `/review` — should redirect to `/review/2026`
- Visit `/review/2025` — should show "2025" badge, "52 Weeks", no disclaimers
- Visit `/review/2026` — should show "2026 Year to Date" badge, actual week count, disclaimers on each category
- Year tabs should appear and switch between years
- Category navigation should still work
- Frontlist filter should still work

**Step 11: Commit**

```bash
git add src/pages/Awards.tsx
git commit -m "feat: integrate multi-year support in Awards page

- Add YearTabs for year navigation
- Dynamic stats from useYearStats
- YTD disclaimers on all categories
- Dynamic FRONTLIST_YEARS
- Remove hardcoded year defaults"
```

---

### Task 7: Update existing App.test.tsx routing test

**Files:**
- Modify: `src/App.test.tsx`

**Step 1: Review and update**

The existing test at `src/App.test.tsx` doesn't explicitly test the `/review` redirect. If any test references the hardcoded 2025, update it. Otherwise, add a test:

```typescript
it('should redirect /review to current year', async () => {
  renderApp('/review');
  // The ReviewDefaultRedirect should redirect to /review/{currentYear}
  // which renders the Awards page with Year in Review heading
  expect(await screen.findByText(/year in review/i)).toBeInTheDocument();
});
```

**Step 2: Run tests**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add src/App.test.tsx
git commit -m "test: add routing test for /review redirect to current year"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Run build**

Run: `npm run build`
Expected: No TypeScript errors, clean build

**Step 3: Manual smoke test**

Run: `npm run dev` and verify:
- [ ] `/review` redirects to `/review/2026`
- [ ] `/review/2025` shows complete year view (plain "2025" badge, "52 Weeks")
- [ ] `/review/2026` shows YTD view ("2026 Year to Date" badge, "N Weeks So Far")
- [ ] Year tabs appear when multiple years have data
- [ ] Clicking year tabs navigates correctly
- [ ] All 4 categories display data for both years
- [ ] Disclaimers appear on 2026 categories
- [ ] No disclaimers on 2025 categories
- [ ] Frontlist filter works on both years
- [ ] `/awards/2025` legacy redirect still works
