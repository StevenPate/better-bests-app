# Quality & Correctness Audit

An honest assessment of how we verify this application works, what safety nets
exist, and where the gaps are.

**Last audited:** April 2026

---

## Summary

The project has **537 passing unit tests** across **38 test files**, covering
roughly 27% of the 140 non-test source files. Business logic and data hooks are
well-tested. However, there is no CI/CD pipeline, no pre-commit hooks, no E2E
tests, and TypeScript strict mode is disabled. Today, correctness depends
primarily on a developer remembering to run `npm test` locally.

---

## What We Have

### Unit Tests

**Framework:** Vitest + React Testing Library + jest-axe (accessibility)

**Configuration:** `vitest.config.ts` uses jsdom, v8 coverage provider, global
setup in `src/test/setup.ts`.

**38 test files, 537 tests, all passing** (as of April 2026):

| Area | Test files | Tests | What's covered |
|------|-----------|-------|----------------|
| Business logic | `bookFilters`, `bestsellerParser`, `dateUtils`, `navigationHelpers` | ~117 | Filtering, parsing, date math, URL helpers |
| Services | `csvExporter`, `pdfGenerator`, `performanceScoring`, `googleBooksApi` | ~54 | Export formats, scoring algorithms, API caching |
| Data hooks | `useBestsellerData`, `useRegionalHistory`, `useFilters`, `useRegion`, `useBookPerformance`, `useAvailableYears`, `useYearStats` | ~70+ | Supabase query logic, state management, error handling |
| Components | `BestsellerTable`, `Layout`, `RegionSelector`, `MobileNav`, `MainNav`, `HeatMapCell`, `RegionRow`, `ErrorState`, `LoadingState`, `EmptyState`, `YearTabs`, `HeroSection` | ~130+ | Rendering, user interaction, accessibility (axe) |
| Config/lib | `routeSchema`, `regions`, `errors`, `logger`, `featureFlags`, `analytics` | ~100+ | Route validation, error classes, logging, feature flags |
| Integration | `App`, `Index` page | ~10+ | Route mounting, page rendering |

### Type Checking

**TypeScript is configured but not strict.**

Current settings in `tsconfig.app.json`:

```
strict: false
noImplicitAny: false
strictNullChecks: false
noUnusedLocals: false
noUnusedParameters: false
noFallthroughCasesInSwitch: false
```

This means `null` and `undefined` flow through the codebase unchecked, implicit
`any` types are allowed, and unused variables are silently ignored. The compiler
catches syntax and import errors but misses entire categories of runtime bugs.

### Linting

**ESLint** is configured (`eslint.config.js`) with:
- TypeScript ESLint recommended rules
- React Hooks rules (recommended)
- React Refresh warnings
- `no-console` set to error (allows `warn`/`error`)
- `@typescript-eslint/no-unused-vars` disabled
- Ignores: `dist/`, `src/test/`, `supabase/functions/`

Run with `npm run lint`.

No Prettier or EditorConfig is configured. Formatting is not enforced.

### Error Handling

**Structured error system** (`src/lib/errors.ts`):
- Typed error classes: `AppError`, `FetchError`, `DatabaseError`
- Machine-readable error codes (`ErrorCode` enum)
- User-friendly message generation
- Structured logging payloads

**React error boundary** (`src/components/AppErrorBoundary.tsx`):
- Catches render-time errors in the component tree
- Displays user-friendly fallback with recovery options
- Logs errors via structured logger

**Environment-aware logging** (`src/lib/logger.ts`):
- Suppresses debug/info in production
- Structured logging with namespaces
- Configurable via `VITE_ENABLE_DEBUG_LOGS`

### Database Safety

**34 timestamped SQL migrations** in `supabase/migrations/` tracking full schema
evolution, RLS policies, cron jobs, and functions.

**Preflight safety check** (`scripts/preflight-check.ts`):
- Detects production Supabase URL in environment
- Blocks destructive operations (reset, seed) against production
- Requires explicit confirmation for `db:push` to production
- Wired into `db:reset`, `db:push`, and `seed:staging` npm scripts

### Feature Flags

**Centralized feature flag system** (`src/lib/featureFlags.ts`):
- Type-safe environment variable access
- All flags default to OFF in production
- Environment detection (production/staging/development)

### Analytics

**Umami Analytics** integration (`src/lib/analytics.ts`), optional, configured
via environment variables.

---

## What We Don't Have

### No CI/CD Pipeline

There are no GitHub Actions workflows. Nothing runs automatically on push or
pull request. This means:
- Tests only run if a developer remembers to run them
- Lint errors can be committed and deployed
- Type errors are not caught before merge
- There is no build verification step

### No Pre-Commit Hooks

No Husky, lint-staged, or any pre-commit hooks. There is nothing stopping broken
code, lint failures, or sensitive files from being committed.

### No E2E Tests

No Playwright, Cypress, or any end-to-end framework. User flows (login,
filtering, export, region switching) are only verified by manual testing.

### No Coverage Thresholds

Coverage reports are available (`npm run test:coverage`) but no minimum
thresholds are enforced. Coverage can silently regress without anyone noticing.

The existing `docs/TESTING.md` documents aspirational targets (business logic
80%+, services 70%+, components 50%+, overall 60%+) but these are not enforced
in configuration.

### No External Error Monitoring

No Sentry, LogRocket, or equivalent. Errors in production are logged to the
browser console (and suppressed in production mode). If something breaks for a
user, we don't know about it unless they report it.

### No Environment Validation

Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, etc.) are
documented in `.env.example` but not validated at startup. There is no Zod
schema or equivalent ensuring required variables are present and well-formed.
A missing or malformed variable will cause a runtime error, not a startup error.

### No Tests for Backend Code

The 15 Supabase Edge Functions (`supabase/functions/`) and the Trigger.dev task
(`trigger/`) have zero test files. These handle data fetching, batch operations,
metrics calculations, and the regional bestseller pipeline.

---

## How Correctness Is Actually Verified Today

1. A developer runs `npm test` locally (if they remember)
2. TypeScript catches syntax and import errors (but not null safety or type
   narrowing issues)
3. ESLint catches some code quality issues (but not unused variables)
4. Manual browser testing
5. The preflight check prevents accidental production database operations

That's it. There is no automated gate between "code written" and "code deployed."

---

## Recommended Improvements (Priority Order)

These are ordered by impact-to-effort ratio.

### 1. Enable TypeScript strict mode

**Impact:** High | **Effort:** Medium

Turn on `strict: true` in `tsconfig.app.json`. This enables `strictNullChecks`,
`noImplicitAny`, and related checks. Expect to fix existing type errors, but
each fix is a real bug that was previously hiding.

### 2. Add CI/CD pipeline

**Impact:** High | **Effort:** Low

A GitHub Actions workflow that runs on every push/PR:
- `npm run lint`
- `npx tsc --noEmit` (type checking)
- `npm test -- --run` (tests)
- `npm run build` (build verification)

This single change means nothing broken can be merged.

### 3. Add pre-commit hooks

**Impact:** Medium | **Effort:** Low

Install Husky + lint-staged to run lint and type checks on staged files before
each commit. Fast feedback loop, catches issues before they reach the remote.

### 4. Enforce coverage thresholds

**Impact:** Medium | **Effort:** Low

Add thresholds to `vitest.config.ts`:

```ts
coverage: {
  thresholds: {
    statements: 50,
    branches: 40,
    functions: 45,
    lines: 50,
  }
}
```

Prevents silent coverage regression.

### 5. Add E2E tests for critical flows

**Impact:** High | **Effort:** High

Add Playwright for the most important user flows: page load, region switching,
filtering, CSV/PDF export. Even 5-10 E2E tests covering happy paths would
significantly increase confidence.

### 6. Add error monitoring

**Impact:** Medium | **Effort:** Low

Integrate Sentry or similar. The structured error system (`src/lib/errors.ts`)
is already well-designed for this; it just needs a transport to send errors to
an external service.

### 7. Add backend tests

**Impact:** Medium | **Effort:** Medium

The Supabase Edge Functions and Trigger.dev tasks handle critical data
operations (fetching bestseller lists, computing scores, aggregating metrics)
with no test coverage at all.

---

## Does This Code Solve the Right Problems?

A subjective assessment of whether the engineering investment matches the
business need.

### The core workflow: clearly yes

The weekly loop — "what's new, what dropped, update the displays, generate the
orders" — is the heart of the app, and it works well. Add/drop tracking, CSV
export in retailer-compatible format, POS/shelf checkboxes, PDF printouts with
genre classifications: these aren't speculative features. They map directly to
tasks someone does every Wednesday at a real bookstore. The specificity of the
features (audience classifications matching physical store sections, CSV format
matching inventory system imports, POS and shelf talker checkboxes) reflects
genuine domain knowledge.

Conservative estimate: the app saves roughly an hour per week of manual work
that previously involved comparing text files, hand-building spreadsheets, and
tracking display updates on paper.

### The tension: workflow tool vs. analytics platform

The codebase is two things at once:

1. **A workflow tool** for one bookstore's weekly list management (add/drop
   tracking, POS/shelf checkboxes, CSV export, PDF printouts)
2. **An analytics platform** with logarithmic scoring algorithms, cross-regional
   discovery, year-end rankings across four categories, 52-week heatmaps, and
   performance metrics aggregated by nightly cron jobs

The workflow tool (#1) is narrow, focused, and clearly solves a real problem.

The analytics platform (#2) is technically sophisticated — logarithmic scoring,
nightly aggregation crons, yearly metrics tables, multi-category rankings — but
it serves a single-user audience. That's 34 database migrations, 15 edge
functions, a Trigger.dev pipeline, and nightly cron jobs. This is substantial
infrastructure. Whether that investment is justified depends on which of these
is true:

- **Platform investment:** If the plan is to serve all ~200 PNBA member stores
  (or stores across all 9 regional associations), the analytics infrastructure
  is forward-looking and makes sense.
- **Builder learning:** The analytics features may have been as much about
  exploring the problem space as solving an immediate need. That has its own
  value.
- **Genuinely used:** The store owner may actually study weekly performance
  trends, cross-regional scores, and year-end rankings before making ordering
  decisions.

Only the person running the store can answer which of these is true.

### Problems that might matter more

If this is primarily a workflow tool for one bookstore, the highest-value
unsolved problems may be more mundane than more analytics depth:

**"Did I already order this book?"** — The app tracks what's on the list and
whether displays were updated, but not whether the book was actually ordered.
The workflow ends at CSV export; there's no state tracking for what happened
after that.

**"How did this book actually sell in my store?"** — No POS data integration.
The app knows what's bestselling regionally, but not whether those books sell
well at this specific store. Correlating list position with local sales data
would close the most important feedback loop.

**"Tell me when something interesting happens."** — Staff must manually check
the app every Wednesday. There are no email or push notifications. A simple
"3 new adds this week, 2 drops" email would reduce the chance of missing a
week. (This is on the roadmap but not built.)

**"Let my staff use this without me."** — The authentication model is
single-user (one `pbn_staff` role). If multiple staff members need to track
their own POS/shelf progress, there's no way to distinguish who did what.

### The Elsewhere feature: right problem, right solution

One feature that clearly earns its complexity is the Elsewhere page. "What's
selling in other regions that has never appeared on our list?" is a question
that would take hours to answer manually and is genuinely actionable for
ordering decisions. This is the kind of insight that justifies the
cross-regional data infrastructure.

### Where to invest next

The question isn't whether the existing features are good (they are), but
whether the next unit of effort should go into:

- **More analytics depth** — more ranking categories, more visualizations, more
  scoring refinements
- **Closing the workflow loop** — ordering state tracking, notifications, sales
  correlation, multi-user support

The answer depends on whether this app's future is as a personal power tool or
as a platform for the independent bookselling community.

---

## Is This Code as Simple as It Could Be?

An assessment of whether the codebase does only what's needed, in a way that
humans and machines can understand and maintain.

### What's done well

**Naming and readability are excellent.** Hooks are prefixed with `use`, services
have clear domain names, utilities use verb-based camelCase, components use
PascalCase. Names communicate intent without abbreviation or jargon:
`matchesAddDropFilter`, `getMostRecentWednesday`, `buildPathFromFilters`. A new
developer could read most files and understand what they do without context.

**File organization is clear.** The `src/` directory has a logical structure:
`components/`, `hooks/`, `services/`, `pages/`, `utils/`, `types/`, `lib/`,
`config/`. Each directory has a well-defined purpose, and files land where you'd
expect them.

**JSDoc comments explain "why," not "what."** Over 300 JSDoc blocks across the
codebase, and they're genuinely useful — explaining business rules, parameters,
and usage patterns rather than restating code. Comments are accurate and
up-to-date; no stale or misleading comments were found.

**Types are clean and minimal.** Type definitions are focused, use optional
fields appropriately, and live in one place. Supabase types are auto-generated
from the schema. No type duplication.

### UI component cleanup (done)

~~The app was initialized with the full shadcn/ui component library (56 files),
most unused.~~ A cleanup pass reduced `src/components/ui/` to **23 files**, all
of which are imported by application code. The unused npm dependencies were
mostly removed. All remaining Radix dependencies are in active use.

### Dead code (done)

Previously dead files (`FetchPreviousWeek.tsx`, `FileUpload.tsx`,
`nav-items.tsx`) have been deleted.

### Duplicate feature flag systems (done)

Previously two files (`environment.ts` and `featureFlags.ts`) implemented the
same logic. `environment.ts` has been removed; only `featureFlags.ts` remains.

### Sonner toast removed (done)

The duplicate Sonner toast system has been removed. Only the Radix UI Toast
(`src/components/ui/toast.tsx` + `toaster.tsx` + `hooks/use-toast.ts`) remains.

### Large file refactoring (mostly done)

| File | Before | After | Status |
|------|--------|-------|--------|
| `src/utils/bestsellerParser.ts` | 1,232 lines | 3-line barrel re-export | Split into `bestsellerFetcher.ts`, `bestsellerTextParser.ts`, `bestsellerCache.ts` |
| `src/services/googleBooksApi.ts` | 899 lines | 535 lines | Cache extracted to `googleBooksCache.ts` |
| `src/components/ui/sidebar.tsx` | 600+ lines | deleted | Removed (was unused) |
| `src/pages/Diagnostics.tsx` | 691 lines | 691 lines | Not yet split |
| `src/pages/Index.tsx` | 481 lines | 481 lines | Not yet split |

### Serverless shared modules (done)

~~Utility functions were copy-pasted across edge functions.~~
A `supabase/functions/_shared/` directory now exists with `cors.ts`,
`parser.ts`, `regions.ts`, `types.ts`, and `utils.ts`.

### BestsellerTable decomposition (done)

~~The directory had 10 files, some under 50 lines.~~ Reduced to **8 files**
after inlining small sub-components back into their parent.

### What simplification would look like

Most of the original cleanup list has been completed. Remaining items:

- Split `Diagnostics.tsx` (691 lines) into panel sub-components
- Split `Index.tsx` (481 lines) to separate filter state from rendering

### The overall picture

A significant cleanup pass has been completed since the original audit. The
scaffolding bloat (56 UI components trimmed to 23), dead code, duplicate
systems (feature flags, toast), large monolithic files (bestsellerParser,
googleBooksApi), and serverless duplication have all been addressed.

The codebase now more closely matches its actual scope. The remaining
simplicity gaps are minor: two large page components that could be split,
and one possibly stale npm dependency.
