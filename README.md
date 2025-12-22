# Better Bestsellers App

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e.svg)](https://supabase.com/)

A React/TypeScript application for tracking and analyzing regional independent bookseller bestseller lists across all 9 major bookselling regions. Built for Port Book and News, this app provides comprehensive tools for bookstore staff including automated data collection, cross-regional discovery, performance analytics, PDF/CSV export, and historical tracking.

## 🌟 Features

### Core Functionality
- **Automated Data Collection** - Weekly cron jobs fetch current bestseller lists from all 9 regional associations
- **Multi-Region Support** - Track bestsellers across PNBA, SIBA, GLIBA, CALIBAN, CALIBAS, MPIBA, MIBA, NAIBA, and NEIBA
- **Historical Tracking** - 52-week data retention with automated adds/drops comparison
- **Audience Classification** - Filter by Adult, Teen, and Children's categories
- **Smart Search** - Real-time search across titles, authors, and ISBNs

### Regional Analytics
- **Regional Performance Heatmaps** - GitHub-style visualization showing book performance across all 9 regions over 26/52 weeks
- **Performance Scoring** - Proprietary algorithm calculates book performance scores based on rank and consistency
- **Cross-Regional Discovery** - "Elsewhere" view identifies bestselling books from other regions that have never appeared on your local list
- **Trend Analysis** - Track books moving up/down across multiple regional lists simultaneously
- **Aggregate Metrics** - See which books are hot in multiple regions with strength indices

### Professional Tools
- **PDF Generation** - Create formatted reports with checkboxes for POS and shelf management
- **CSV Export** - Generate retailer-ready files (adds, drops, current list) for inventory systems
- **ISBN Batch Copy** - One-click copy of all ISBNs for ordering
- **Google Books Integration** - Automatic genre classification and metadata enrichment with two-tier caching
- **POS/Shelf Switching** - Database-backed tracking of which books have been updated in displays

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (install with [nvm](https://github.com/nvm-sh/nvm))
- npm or yarn
- Supabase account (for database and edge functions)

### Installation

```bash
# Clone the repository
git clone https://github.com/stevenpate/better-bestsellers-app.git
cd better-bestsellers-app

# Install dependencies
npm i

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`

## 📁 Project Structure

```
book-parse-hub/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui components (Button, Card, etc.)
│   │   ├── BestsellerTable/ # Modular table component
│   │   │   ├── index.tsx
│   │   │   ├── BookRow.tsx
│   │   │   ├── TableHeader.tsx
│   │   │   └── utils.ts
│   │   ├── BookChart/       # Regional performance heatmaps
│   │   │   ├── RegionalHeatMap.tsx
│   │   │   ├── HeatMapGrid.tsx
│   │   │   ├── HeatMapAccordion.tsx
│   │   │   ├── RegionRow.tsx
│   │   │   └── HeatMapCell.tsx
│   │   ├── BookPerformanceMetrics/ # Performance scoring display
│   │   └── ThemeToggle.tsx
│   ├── pages/               # Route components
│   │   ├── Index.tsx        # Main bestseller list page (648 lines)
│   │   ├── Elsewhere.tsx    # Cross-region discovery
│   │   ├── BookDetail.tsx   # Individual book history & analytics
│   │   └── Auth.tsx         # Authentication
│   ├── services/            # Business logic layer
│   │   ├── googleBooksApi.ts    # Google Books integration (100% tested)
│   │   ├── csvExporter.ts       # CSV generation (100% tested)
│   │   └── pdfGenerator.ts      # PDF reports with progress tracking
│   ├── utils/               # Utility functions
│   │   ├── bestsellerParser.ts  # Core PNBA parsing logic
│   │   ├── dateUtils.ts         # Date manipulation (100% tested)
│   │   └── bookParser.ts        # Book data processing
│   ├── types/               # TypeScript definitions
│   │   ├── bestseller.ts
│   │   ├── book.ts
│   │   ├── elsewhere.ts
│   │   └── performance.ts
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.tsx              # Authentication & user management
│   │   ├── useBestsellerData.ts     # React Query hook for bestseller data
│   │   ├── useBookAudiences.ts      # Batch audience lookups
│   │   ├── useFilters.ts            # Filter state + URL sync
│   │   ├── useRegionalHistory.ts    # Regional heatmap data
│   │   ├── useBookPerformance.ts    # Performance metrics
│   │   └── useBestsellerSwitches.tsx # POS/shelf switching
│   ├── lib/                 # Utility libraries
│   │   └── logger.ts        # Environment-aware logging
│   ├── config/              # Configuration files
│   └── integrations/        # External service integrations
│       └── supabase/        # Supabase client and types
├── supabase/
│   ├── functions/           # Edge functions (Deno)
│   │   ├── fetch-pnba-lists/             # PNBA data fetcher
│   │   ├── populate-regional-bestsellers/ # Multi-region data sync
│   │   ├── fetch-elsewhere-books/         # Server-side Elsewhere query
│   │   ├── calculate-weekly-scores/       # Performance scoring
│   │   ├── update-book-metrics/           # Aggregate metrics
│   │   ├── batch-switch-operations/       # Bulk POS/shelf updates
│   │   └── backfill-52-weeks/            # Historical data population
│   └── migrations/          # Database migrations (28 files)
├── scripts/                 # Utility scripts
│   ├── populate-regional-data.sh    # Manual regional data sync
│   ├── populate-regional-data.js    # Alternative JS method
│   ├── seed-staging-data.ts         # Staging database seeding
│   └── preflight-check.ts           # Pre-deployment checks
├── docs/                    # Documentation
│   ├── TESTING.md                   # Comprehensive testing guide
│   ├── ENVIRONMENT_SETUP.md         # Environment configuration
│   ├── fix-regional-data.md         # Regional sync troubleshooting
│   ├── architecture/                # Architecture documentation
│   │   ├── CACHE_ARCHITECTURE.md
│   │   └── batch-switch-operations-api.md
│   ├── implementation/              # Implementation tracking
│   │   ├── IMPLEMENTATION_CHECKLIST.md
│   │   └── REMAINING_IMPROVEMENTS.md
│   └── operations/                  # Operations & runbooks
│       ├── RUNBOOK.md
│       ├── MIGRATION_WORKFLOW.md
│       ├── STAGING_DATA_MAINTENANCE.md
│       ├── supabase-cli-profiles.md
│       └── supabase-migrations.md
└── tests/                   # Test files
```

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev              # Start dev server (uses current .env)
npm run dev:staging      # Start with staging backend
npm run dev:prod         # Start with production backend
npm run build            # Production build
npm run build:dev        # Development build
npm run build:staging    # Build with staging config
npm run build:prod       # Build with production config
npm run preview          # Preview production build

# Testing
npm test                 # Run tests in watch mode
npm test -- --run        # Run tests once
npm test:ui              # Open Vitest UI
npm test:coverage        # Generate coverage report

# Database Management
npm run db:staging       # Link to staging database
npm run db:prod          # Link to production database
npm run db:reset:staging # Reset and seed staging data
npm run seed:staging     # Seed staging with test data

# Code Quality
npm run lint             # Run ESLint
```

### Environment Switching

The app supports multiple environments for safe feature development:

**Production (Live data):**
```bash
npm run dev:prod         # Start with production backend
npm run build:prod       # Build for production
```

**Staging (Test data):**
```bash
npm run dev:staging      # Start with staging backend
npm run build:staging    # Build for staging
```

See `docs/ENVIRONMENT_SETUP.md` for detailed environment configuration.

### Logging

**Always use the logger utility** instead of `console.*`:

```typescript
import { logger } from '@/lib/logger';

// Development only (suppressed in production)
logger.debug('Detailed diagnostic info');
logger.info('Operation completed');

// Always logged (dev + production)
logger.warn('Warning message');
logger.error('Error occurred', error);

// With namespace (recommended)
logger.debug('BestsellerParser', 'Fetching data...');
```

**Environment Behavior:**

| Mode | `debug()` | `info()` | `warn()` | `error()` |
|------|-----------|----------|----------|-----------|
| **Development** (`npm run dev`) | ✅ Shows | ✅ Shows | ✅ Shows | ✅ Shows |
| **Production** (`npm run build`) | ❌ Hidden | ❌ Hidden | ✅ Shows | ✅ Shows |
| **Production + Debug Flag** | ✅ Shows | ✅ Shows | ✅ Shows | ✅ Shows |

**Enable verbose logging in production:**
```bash
# Add to .env
VITE_ENABLE_DEBUG_LOGS="true"
```

**ESLint Enforcement:**
- The `no-console` rule prevents `console.log`, `console.debug`, `console.info` in application code
- Use the logger utility for all logging needs

### Tech Stack

**Frontend:**
- React 18.3 with TypeScript
- Vite for blazing-fast builds
- shadcn/ui components (Radix UI primitives)
- Tailwind CSS for styling
- React Router for navigation
- React Query (@tanstack/react-query) for server state

**Backend:**
- Supabase (PostgreSQL database)
- Supabase Edge Functions (Deno runtime)
- pg_cron for scheduled jobs
- pg_net for HTTP requests from database

**External APIs:**
- Google Books API for metadata
- BookWeb.org for regional bestseller data

**Testing:**
- Vitest for unit/integration tests
- React Testing Library for components

## 📊 Database Schema

### Core Tables

**`book_positions`** - PNBA historical bestseller rankings (legacy)
```sql
- id, isbn, title, author, publisher
- category, rank, price, week_date
- created_at, updated_at
```

**`regional_bestsellers`** - Multi-region bestseller data
```sql
- id, region, isbn, title, author, publisher
- category, rank, week_date, list_title, price
- created_at
- UNIQUE(region, isbn, week_date)
```

**`weekly_scores`** - Performance scores by week/region
```sql
- id, isbn, region, week_date
- rank, score, category
- created_at
```

**`book_performance_metrics`** - Aggregate yearly performance
```sql
- isbn, year
- total_score, avg_score_per_week
- weeks_on_chart, regions_appeared
- best_rank_overall, first_appearance, last_appearance
```

**`book_regional_performance`** - Per-region yearly metrics
```sql
- isbn, region, year
- regional_score, weeks_on_chart
- best_rank, avg_rank
- regional_strength_index
```

**`bestseller_switches`** - POS/shelf tracking
```sql
- id, region, book_isbn, switch_type
- list_date, created_by
- UNIQUE(region, book_isbn, switch_type)
```

**`book_audiences`** - Audience classifications
```sql
- id, region, isbn, audience
- created_at, updated_at
- UNIQUE(region, isbn)
```

**`regions`** - Reference table for supported regions
```sql
- abbreviation (PK), full_name, region_code
- is_active, created_at, updated_at
```

**`fetch_cache`** - API response caching
```sql
- cache_key, data, last_fetched
```

### Views & Functions

**`distinct_books`** - Unique books across all data sources
**`mv_historical_coverage`** - Data availability metrics
**`calculate_weekly_scores()`** - Score calculation function
**`aggregate_book_metrics()`** - Metrics aggregation function

## ⚙️ Automation & Cron Jobs

### Automated Data Collection

**PNBA Bestseller Fetcher** - Multiple attempts every Wednesday:
- 8:30 AM PDT (15:30 UTC)
- 9:00 AM PDT (16:00 UTC)
- 9:30 AM PDT (16:30 UTC)
- 9:45 AM PDT (16:45 UTC)
- 10:00 AM PDT (17:00 UTC)

**Regional Bestseller Sync** - Weekly updates for all 9 regions:
- **Primary**: 10:15 AM PDT (17:15 UTC) on Wednesdays
- **Retry**: 10:45 AM PDT (17:45 UTC) if data missing

**Performance Metrics Update** - Nightly aggregation:
- 2:00 AM PDT (10:00 UTC) daily

### Manual Scripts

**Populate Regional Data:**
```bash
./scripts/populate-regional-data.sh  # Interactive script
```

**Supabase Functions:**
```bash
# Populate specific regions
supabase functions invoke populate-regional-bestsellers \
  --body '{"regions": ["PNBA"], "weeks": 4}'

# Calculate scores
supabase functions invoke calculate-weekly-scores \
  --body '{"weekDate": "2025-11-26", "region": "PNBA"}'
```

## 🌐 Routing

### Current Routes
- `/` - Main bestseller list (PNBA default)
- `/adult`, `/teen`, `/children` - Audience-specific views
- `/adds`, `/drops`, `/adds-drops` - Filter by list changes
- `/adult/adds`, `/teen/drops`, etc. - Combined filters
- `/elsewhere` - Cross-region discovery with advanced filtering
- `/book/:isbn` - Individual book detail page with regional heatmaps
- `/auth` - Authentication

## 🔑 Environment Variables

```bash
# Required
VITE_SUPABASE_URL="https://<your-project>.supabase.co"
VITE_SUPABASE_ANON_KEY="your-public-anon-key"

# Required for scripts and cron jobs
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional: Google Books API key for higher quota
# VITE_GOOGLE_BOOKS_API_KEY=""

# Optional: Enable verbose debug logging in production
# VITE_ENABLE_DEBUG_LOGS="true"
```

> ℹ️ The app validates Supabase variables on startup. If missing, the dev server
> will throw a descriptive error. Copy `.env.example` and populate your credentials.

## 🎨 Design System

- **Colors:** Purple/violet theme with dark mode support
- **Typography:** System fonts with clear hierarchy
- **Components:** Consistent shadcn/ui patterns
- **Icons:** Lucide React icon library
- **Responsive:** Mobile-first design with desktop optimization
- **Accessibility:** ARIA labels, keyboard navigation, screen reader support

## 📈 Recent Improvements

### Phase 1-2: Service Layer & Testing (Oct 2025)

✅ **Service Layer Architecture**
- Extracted business logic from UI components
- Created dedicated services for PDF, CSV, and API integrations
- Reduced `Index.tsx` from 1,020 to 648 lines (36% reduction)
- Comprehensive JSDoc documentation for all service APIs

✅ **Performance Optimization**
- Parallel Google Books API calls (10 concurrent requests)
- Two-tier caching: in-memory (30 min) + Supabase (30 days)
- 5-10x faster PDF generation with progress tracking
- Cache staleness checks prevent serving stale data

✅ **Comprehensive Testing**
- 118 passing tests across 5 test files
- 60%+ overall project coverage (target met)
- 100% coverage on critical utilities (`dateUtils`, `csvExporter`)
- Component testing with React Testing Library

### Phase 3: Multi-Region Support (Nov 2025)

✅ **Regional Data Infrastructure**
- Support for all 9 regional bookseller associations
- Automated weekly data collection via cron jobs
- `regional_bestsellers` table with 52-week retention
- Normalized ISBN handling across all data sources

✅ **Regional Analytics**
- GitHub-style performance heatmaps (26/52 weeks/all history)
- Per-region and aggregate performance metrics
- Weekly scoring algorithm (rank-based with consistency bonus)
- Regional strength indices for cross-region comparison

✅ **Elsewhere Discovery**
- Server-side query optimization for fast filtering
- Advanced filtering: by region, time range, audience, rank
- Pagination support (up to 1000 results)
- Smart exclusion of books that have ever appeared on target region

✅ **Book Detail Pages**
- Individual book pages with complete cross-regional history
- Interactive heatmaps showing performance across all 9 regions
- Performance metrics cards (2025 yearly scores)
- Regional breakdown with strength visualization

### Phase 4: Data Reliability & Operations (Dec 2025)

✅ **Automated Data Synchronization**
- Weekly cron jobs for PNBA (5 time slots for reliability)
- Weekly regional sync (2 time slots with smart retry logic)
- Nightly performance metrics aggregation
- 52-week data retention with automatic cleanup

✅ **Production Stability**
- Fixed batch-switch-operations edge function (constraint sync)
- Regional data lag resolution (missing weeks backfilled)
- Database migration pipeline (28 migrations applied)
- Comprehensive troubleshooting documentation

✅ **Developer Experience**
- Interactive population scripts for manual data sync
- SQL debugging queries for data verification
- Migration logs with rollback procedures
- Edge function deployment automation

See `docs/implementation/IMPLEMENTATION_CHECKLIST.md` for detailed progress tracking.

## 🗺️ Roadmap

### ✅ Phase 1-2: Service Layer & Testing (COMPLETE - Oct 2025)
- Service layer architecture
- Comprehensive testing suite
- Performance optimization
- Environment configuration

### ✅ Phase 3: Multi-Region Support (COMPLETE - Nov 2025)
- 8-region data collection
- Regional performance heatmaps
- Elsewhere discovery enhancements
- Performance scoring system

### ✅ Phase 4: Automation & Reliability (COMPLETE - Dec 2025)
- Automated weekly data collection
- Performance metrics aggregation
- Production stability fixes
- Operational tooling

### 🚧 Phase 5: Advanced Analytics (In Progress)
- [ ] Historical trend visualizations (line charts, sparklines)
- [ ] Predictive analytics for emerging trends
- [ ] Season-over-season comparisons
- [ ] Publisher performance dashboards
- [ ] Category-specific insights

### 📅 Phase 6: User Features (Planned)
- [ ] Watchlist functionality (track specific books/authors)
- [ ] Email notifications for watched books
- [ ] Custom report generation
- [ ] Saved filter presets
- [ ] Annotation/notes on books

### 🔮 Phase 7: Collaboration & Integration (Future)
- [ ] Team collaboration features
- [ ] Inventory system integrations
- [ ] Mobile app (React Native)
- [ ] Public API for PNBA members
- [ ] Data export in multiple formats

See `docs/implementation/REMAINING_IMPROVEMENTS.md` for full roadmap details.

## 🧪 Testing

**Comprehensive test suite with 118 passing tests** across critical modules.

### Current Test Coverage

| Module | Coverage | Tests | Status |
|--------|----------|-------|--------|
| `dateUtils.ts` | 100% | 14 | ✅ Complete |
| `csvExporter.ts` | 100% | 26 | ✅ Complete |
| `BestsellerTable.tsx` | 70.19% | 37 | ✅ Complete |
| `googleBooksApi.ts` | ~60% | 8 | ✅ Complete |
| `bestsellerParser.ts` | 43.72% | 33 | ✅ Complete |
| **Overall Project** | **60%+** | **118** | ✅ Target Met |

### Running Tests

```bash
# Development (watch mode)
npm test

# Single run (CI/CD)
npm test -- --run

# Coverage report
npm test:coverage

# Interactive UI
npm test:ui

# Specific file
npm test -- dateUtils

# Specific pattern
npm test -- parser
```

### Testing Guide

For comprehensive testing documentation including:
- Testing philosophy and best practices
- Writing new tests (utilities, services, components)
- Mocking strategies (Supabase, APIs, dates)
- Manual performance testing

**See:** [`docs/TESTING.md`](docs/TESTING.md)

## 🤝 Contributing

This is a private project for Port Book and News, but contributions are welcome:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Follow existing TypeScript patterns
- Use shadcn/ui for new components
- Write tests for new utilities
- Use the logger utility instead of console.*
- Update documentation

## 📄 License

Private - All Rights Reserved

## 🙏 Acknowledgments

- All 9 regional bookseller associations for data
- American Booksellers Association (BookWeb.org)
- Google Books API
- Port Book and News team
- AI development tools: [Claude](https://claude.ai) and [ChatGPT](https://chat.openai.com) for code assistance and data processing

## 📞 Support

For issues or questions:
- GitHub Issues: [Report a bug](https://github.com/stevenpate/better-bestsellers-app/issues)
- Documentation: See `/docs` folder

## 🔗 Links

- **Live App:** [https://betterbests.app](https://betterbests.app)
- **Documentation:** [/docs](/docs)
- **PNBA:** [https://www.pnba.org/](https://www.pnba.org/)
- **BookWeb:** [https://www.bookweb.org/](https://www.bookweb.org/)

---

**Built with ❤️ for independent booksellers**

*Last updated: December 2025*