# Testing Guide

Comprehensive testing documentation for the Better Bestsellers application.

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Quick Start](#quick-start)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Coverage Requirements](#coverage-requirements)
6. [Testing Patterns](#testing-patterns)
7. [Manual Testing](#manual-testing)
8. [Troubleshooting](#troubleshooting)

---

## Testing Philosophy

### Core Principles

**1. Test Business Logic First**
- Focus on utilities and services (80%+ coverage)
- Component tests for critical UI interactions (50%+ coverage)
- Don't test implementation details, test behavior

**2. Fast Feedback Loops**
- Unit tests should run in milliseconds
- Use vitest watch mode during development
- Mock external dependencies (Supabase, APIs)

**3. Confidence Over Coverage**
- Coverage metrics are guides, not goals
- One good test is worth more than five superficial tests
- Focus on edge cases and error handling

**4. Maintainable Tests**
- Co-locate tests with source files (`*.test.ts` next to `*.ts`)
- Use descriptive test names that explain intent
- Keep tests simple and readable

### What to Test

✅ **Always Test:**
- Business logic functions (parsers, utilities)
- Service layer APIs (PDF, CSV, API integrations)
- Data transformations and calculations
- Error handling and edge cases
- Critical user interactions (filtering, search)

⚠️ **Sometimes Test:**
- Complex React components with state logic
- Custom hooks with non-trivial logic
- Integration points between services

❌ **Don't Test:**
- Third-party libraries (React, Supabase SDK)
- Simple UI components without logic
- Type definitions
- Configuration files

---

## Quick Start

### Installation

Tests are already configured with the project:

```bash
# Install dependencies (includes vitest)
npm i
```

### Run All Tests

```bash
# Watch mode (recommended for development)
npm test

# Single run (CI/CD)
npm test -- --run

# With coverage report
npm test:coverage

# Interactive UI
npm test:ui
```

### Run Specific Tests

```bash
# Single file
npm test -- dateUtils.test.ts

# Pattern matching
npm test -- parser

# Specific test suite
npm test -- --grep "parseList"
```

---

## Running Tests

### Available Commands

| Command | Description | Use Case |
|---------|-------------|----------|
| `npm test` | Watch mode | Active development |
| `npm test -- --run` | Single run | Pre-commit, CI/CD |
| `npm test:ui` | Visual UI | Debugging, exploration |
| `npm test:coverage` | Coverage report | Quality checks |
| `npm test -- <file>` | Specific file | Focused work |

### Watch Mode Tips

```bash
# Start watch mode
npm test

# Interactive commands (in watch mode):
# Press 'a' - Run all tests
# Press 'f' - Run only failed tests
# Press 'p' - Filter by filename pattern
# Press 't' - Filter by test name pattern
# Press 'q' - Quit watch mode
```

### Coverage Reports

Generate detailed coverage:

```bash
npm test:coverage
```

This creates:
- Terminal summary with percentages
- HTML report in `coverage/index.html`
- Detailed line-by-line coverage

Open coverage report:
```bash
open coverage/index.html
```

---

## Writing Tests

### File Structure

Tests are co-located with source files:

```
src/
├── utils/
│   ├── dateUtils.ts
│   ├── dateUtils.test.ts          # ← Test file
│   ├── bestsellerParser.ts
│   └── bestsellerParser.test.ts   # ← Test file
├── services/
│   ├── csvExporter.ts
│   ├── csvExporter.test.ts        # ← Test file
│   └── pdfGenerator.ts
└── components/
    ├── BestsellerTable.tsx
    └── BestsellerTable.test.tsx   # ← Test file
```

### Basic Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myFile';

describe('myFunction', () => {
  it('should handle basic case', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('should handle edge case', () => {
    const result = myFunction(null);
    expect(result).toBe(null);
  });

  it('should throw error for invalid input', () => {
    expect(() => myFunction('bad')).toThrow('Invalid input');
  });
});
```

### Testing Utilities

Example from `src/utils/dateUtils.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLastWednesday,
  formatDateForURL,
  parseWednesdayDate
} from './dateUtils';

describe('dateUtils', () => {
  beforeEach(() => {
    // Reset date to a known value for consistent tests
    vi.setSystemTime(new Date('2024-10-10T12:00:00Z'));
  });

  describe('getLastWednesday', () => {
    it('should return last Wednesday when today is Thursday', () => {
      const result = getLastWednesday();
      expect(result.getDay()).toBe(3); // Wednesday
    });

    it('should return yesterday when today is Thursday', () => {
      const today = new Date('2024-10-10'); // Thursday
      const result = getLastWednesday(today);
      expect(result.toISOString().split('T')[0]).toBe('2024-10-09');
    });
  });

  describe('formatDateForURL', () => {
    it('should format date as MM-DD-YYYY', () => {
      const date = new Date('2024-10-09');
      expect(formatDateForURL(date)).toBe('10-09-2024');
    });
  });
});
```

### Testing Services

Example from `src/services/csvExporter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateCSV } from './csvExporter';
import type { EnhancedBook } from '@/types/bestseller';

describe('csvExporter', () => {
  const mockBooks: EnhancedBook[] = [
    {
      title: 'Test Book',
      author: 'Test Author',
      isbn: '9781234567890',
      rank: 1,
      isAdded: true,
      isDropped: false,
      category: 'Fiction',
      publisher: 'Test Publisher',
      price: 24.99
    }
  ];

  describe('generateCSV', () => {
    it('should generate CSV with correct format', () => {
      const csv = generateCSV(mockBooks, 'adds_no_drops');
      const lines = csv.split('\n');

      expect(lines[0]).toBe('9781234567890,0,Test Book,,Test Author,Test Publisher,24.99');
    });

    it('should handle empty book list', () => {
      const csv = generateCSV([], 'adds_no_drops');
      expect(csv).toBe('');
    });

    it('should escape special characters', () => {
      const booksWithCommas: EnhancedBook[] = [{
        ...mockBooks[0],
        title: 'Test, Book: With Punctuation'
      }];

      const csv = generateCSV(booksWithCommas, 'adds_no_drops');
      expect(csv).toContain('"Test, Book: With Punctuation"');
    });
  });
});
```

### Testing React Components

Example from `src/components/BestsellerTable.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BestsellerTable } from './BestsellerTable';
import type { EnhancedBook } from '@/types/bestseller';

// Mock dependencies
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    isPBNStaff: true,
    isLoading: false
  })
}));

describe('BestsellerTable', () => {
  const mockBooks: EnhancedBook[] = [
    {
      title: 'Adult Book',
      author: 'Author 1',
      isbn: '9781111111111',
      rank: 1,
      category: 'Adult Fiction',
      audience: 'A',
      isAdded: true,
      isDropped: false
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render books', () => {
    render(<BestsellerTable books={mockBooks} />);
    expect(screen.getByText('Adult Book')).toBeInTheDocument();
  });

  it('should filter by audience', async () => {
    render(<BestsellerTable books={mockBooks} />);

    const adultFilter = screen.getByRole('button', { name: /adult/i });
    fireEvent.click(adultFilter);

    expect(screen.getByText('Adult Book')).toBeInTheDocument();
  });

  it('should handle search input', async () => {
    render(<BestsellerTable books={mockBooks} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'Adult' } });

    await waitFor(() => {
      expect(screen.getByText('Adult Book')).toBeInTheDocument();
    });
  });
});
```

### Mocking External Dependencies

#### Mocking Supabase

```typescript
import { vi } from 'vitest';

// Mock the entire Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockData, error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: mockData, error: null })),
      upsert: vi.fn(() => Promise.resolve({ data: mockData, error: null }))
    }))
  }
}));
```

#### Mocking Date/Time

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

describe('date-dependent tests', () => {
  beforeEach(() => {
    // Set system time to specific date
    vi.setSystemTime(new Date('2024-10-09T12:00:00Z'));
  });

  afterEach(() => {
    // Restore real timers
    vi.useRealTimers();
  });

  it('should use mocked date', () => {
    const now = new Date();
    expect(now.toISOString()).toBe('2024-10-09T12:00:00.000Z');
  });
});
```

#### Mocking Fetch/API Calls

```typescript
import { vi } from 'vitest';

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mock data' }),
    text: () => Promise.resolve('mock text')
  })
) as any;
```

### Testing Typed Errors

The application uses typed errors from `src/lib/errors.ts`. Here's how to test them:

```typescript
import { describe, it, expect } from 'vitest';
import {
  AppError,
  FetchError,
  DatabaseError,
  ErrorCode,
  isAppError,
  hasErrorCode
} from '@/lib/errors';

describe('error handling', () => {
  it('should throw typed errors with context', async () => {
    const fetchData = async () => {
      throw new FetchError(
        ErrorCode.DATA_FETCH_FAILED,
        { resource: 'bestseller_data', region: 'PNBA' }
      );
    };

    await expect(fetchData()).rejects.toThrow(FetchError);
  });

  it('should identify error types', () => {
    const error = new DatabaseError(
      { table: 'regional_bestsellers' },
      'Connection failed'
    );

    expect(isAppError(error)).toBe(true);
    expect(hasErrorCode(error, ErrorCode.DATABASE_ERROR)).toBe(true);
    expect(error.context.table).toBe('regional_bestsellers');
  });

  it('should provide user-friendly messages', () => {
    const error = new FetchError(ErrorCode.DATA_FETCH_FAILED);

    // Error has structured logging payload
    const payload = error.toLogPayload();
    expect(payload.code).toBe('DATA_FETCH_FAILED');
    expect(payload.timestamp).toBeDefined();
  });
});
```

#### Testing Services That Throw Typed Errors

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchElsewhereBooks } from '@/services/elsewhereService';
import { FetchError, ErrorCode } from '@/lib/errors';

// Mock Supabase to return error
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(() => Promise.resolve({
        data: null,
        error: { message: 'Edge function failed' }
      }))
    }
  }
}));

describe('elsewhereService error handling', () => {
  it('should throw FetchError on edge function failure', async () => {
    await expect(fetchElsewhereBooks({ targetRegion: 'PNBA', comparisonRegions: [] }))
      .rejects
      .toThrow(FetchError);
  });

  it('should include context in error', async () => {
    try {
      await fetchElsewhereBooks({ targetRegion: 'PNBA', comparisonRegions: [] });
    } catch (error) {
      expect(error).toBeInstanceOf(FetchError);
      expect((error as FetchError).code).toBe(ErrorCode.DATA_FETCH_FAILED);
      expect((error as FetchError).context.resource).toBe('elsewhere_books');
    }
  });
});
```

---

## Coverage Requirements

### Target Coverage by Module Type

| Module Type | Target | Rationale |
|-------------|--------|-----------|
| **Business Logic** (utils, parsers) | 80%+ | Critical functionality |
| **Services** (PDF, CSV, APIs) | 70%+ | Complex operations |
| **React Components** | 50%+ | UI interactions |
| **Overall Project** | 60%+ | Balanced coverage |

### Current Coverage Status

| Module | Tests | Status |
|--------|-------|--------|
| `dateUtils.ts` | 14 | ✅ Complete |
| `bestsellerParser.ts` | 39 | ✅ Complete |
| `csvExporter.ts` | 33 | ✅ Complete |
| `BestsellerTable.tsx` | 37 | ✅ Complete |
| `googleBooksApi.ts` | 8 | ✅ Complete |
| `pdfGenerator.ts` | 4 | ✅ Complete |
| `errors.ts` | 30 | ✅ Complete |
| Status components | 53 | ✅ Complete |
| Navigation components | 35 | ✅ Complete |
| Hooks (filters, region, data) | 45 | ✅ Complete |
| Config & utilities | 108 | ✅ Complete |

**Total: 506 tests passing across 34 test files**

### Checking Coverage

```bash
# Generate coverage report
npm test:coverage

# View in terminal
# Look for "All files" row in summary table

# View detailed HTML report
open coverage/index.html
```

---

## Testing Patterns

### Pattern 1: Arrange-Act-Assert (AAA)

```typescript
it('should calculate total price', () => {
  // Arrange - Set up test data
  const items = [
    { price: 10, quantity: 2 },
    { price: 5, quantity: 3 }
  ];

  // Act - Execute the function
  const total = calculateTotal(items);

  // Assert - Verify the result
  expect(total).toBe(35);
});
```

### Pattern 2: Test Edge Cases

```typescript
describe('parseISBN', () => {
  it('should handle valid ISBN-13', () => {
    expect(parseISBN('9781234567890')).toBe('9781234567890');
  });

  it('should handle valid ISBN-10', () => {
    expect(parseISBN('1234567890')).toBe('1234567890');
  });

  it('should handle ISBN with hyphens', () => {
    expect(parseISBN('978-1-234-56789-0')).toBe('9781234567890');
  });

  it('should return null for invalid ISBN', () => {
    expect(parseISBN('invalid')).toBe(null);
  });

  it('should handle empty string', () => {
    expect(parseISBN('')).toBe(null);
  });

  it('should handle null/undefined', () => {
    expect(parseISBN(null)).toBe(null);
    expect(parseISBN(undefined)).toBe(null);
  });
});
```

### Pattern 3: Testing Async Functions

```typescript
describe('fetchBestsellerData', () => {
  it('should fetch and parse data', async () => {
    const data = await fetchBestsellerData('10-09-2024');

    expect(data).toBeDefined();
    expect(data.books).toBeInstanceOf(Array);
    expect(data.books[0]).toHaveProperty('isbn');
  });

  it('should handle fetch errors', async () => {
    // Mock fetch to fail
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    await expect(fetchBestsellerData('10-09-2024'))
      .rejects
      .toThrow('Network error');
  });
});
```

### Pattern 4: Snapshot Testing (Use Sparingly)

```typescript
it('should generate consistent CSV format', () => {
  const csv = generateCSV(mockBooks, 'adds_no_drops');
  expect(csv).toMatchSnapshot();
});
```

**Note:** Use snapshots only for stable outputs. Prefer explicit assertions.

---

## Manual Testing

### Performance Testing

For performance-critical features, follow the manual testing guide:

**Location:** `src/test/performance.manual.md`

**Key Tests:**
1. **PDF Generation** - Target: <60s for 120 books
2. **Table Rendering** - Target: <200ms for filter changes
3. **Cache Hit Rate** - Target: 50-100x speedup
4. **Memory Leaks** - Target: <10MB growth over 10 operations
5. **Concurrent Operations** - No race conditions

**Quick Performance Check:**
```bash
npm run test:performance  # Validates test dataset generation
```

### Manual Test Checklist

Before major releases, verify:

- [ ] PDF generation works for all audiences (A/T/C)
- [ ] CSV export includes correct books (adds/drops/all)
- [ ] Search filters results correctly
- [ ] Audience filters apply properly
- [ ] POS/Shelf checkboxes save to database
- [ ] Dark/light theme toggle works
- [ ] Authentication flow works (login/logout)
- [ ] Mobile responsive design looks good
- [ ] No console errors in production build

### Testing in Different Environments

```bash
# Development mode
npm run dev

# Production build locally
npm run build
npm run preview

# Check for console errors
# Open DevTools → Console
# Verify no errors/warnings
```

---

## Troubleshooting

### Common Issues

#### Issue: Tests fail with "Cannot find module"

```bash
# Solution: Check path aliases in vitest.config.ts
# Ensure @/ maps to src/
```

#### Issue: Supabase tests fail

```bash
# Solution: Check mocks in src/test/setup.ts
# Ensure vi.mock() is called before imports
```

#### Issue: Date tests fail randomly

```bash
# Solution: Use vi.setSystemTime() to freeze time
beforeEach(() => {
  vi.setSystemTime(new Date('2024-10-09T12:00:00Z'));
});
```

#### Issue: Component tests timeout

```bash
# Solution: Increase timeout for slow tests
it('should handle slow operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### Debug Mode

Run tests with verbose output:

```bash
# Verbose mode
npm test -- --reporter=verbose

# Show console.log from tests
npm test -- --reporter=verbose --silent=false
```

### Visual Debugging

Use Vitest UI for interactive debugging:

```bash
npm test:ui

# Opens browser at http://localhost:51204
# Features:
# - Click tests to see details
# - View source code
# - See console output
# - Rerun failed tests
```

---

## Best Practices

### DO ✅

- Write tests before fixing bugs (TDD for bug fixes)
- Test one thing per test
- Use descriptive test names (`it('should return null when ISBN is invalid')`)
- Mock external dependencies (APIs, database)
- Clean up after tests (reset mocks, clear localStorage)
- Keep tests fast (<100ms per test)
- Test error cases and edge cases
- Use TypeScript in tests

### DON'T ❌

- Test implementation details
- Write tests that depend on other tests
- Use production APIs in tests
- Commit failing tests
- Skip tests with `it.skip()` without a reason
- Test third-party libraries
- Over-mock (mock only what's necessary)
- Ignore flaky tests (fix them!)

---

## Resources

### Documentation

- **Vitest Docs:** https://vitest.dev/
- **React Testing Library:** https://testing-library.com/react
- **Testing Best Practices:** https://kentcdodds.com/blog/common-mistakes-with-react-testing-library

### Internal Docs

- `docs/implementation/IMPLEMENTATION_CHECKLIST.md` - Testing progress
- `src/test/setup.ts` - Global test configuration
- `vitest.config.ts` - Vitest configuration
- `src/test/performance.manual.md` - Performance testing guide

### Example Tests

- `src/utils/dateUtils.test.ts` - Utility function tests
- `src/utils/bestsellerParser.test.ts` - Complex business logic
- `src/services/csvExporter.test.ts` - Service layer tests
- `src/services/googleBooksApi.test.ts` - API integration with caching
- `src/lib/errors.test.ts` - Error classes and type guards
- `src/components/BestsellerTable.test.tsx` - Component tests
- `src/components/ui/status/*.test.tsx` - Accessibility testing

---

## Quick Reference

### Essential Commands

```bash
npm test                      # Watch mode
npm test -- --run             # Single run
npm test:coverage             # Coverage report
npm test:ui                   # Visual interface
npm test -- <filename>        # Specific file
```

### Common Matchers

```typescript
expect(value).toBe(expected)              // Strict equality
expect(value).toEqual(expected)           // Deep equality
expect(value).toBeTruthy()                // Truthy check
expect(value).toBeNull()                  // Null check
expect(value).toBeUndefined()             // Undefined check
expect(value).toContain(item)             // Array/string contains
expect(value).toHaveProperty('key')       // Object has property
expect(fn).toThrow('error')               // Function throws
expect(promise).resolves.toBe(value)      // Promise resolves
expect(promise).rejects.toThrow()         // Promise rejects
```

### Vitest Imports

```typescript
import {
  describe,          // Group tests
  it,                // Define test
  expect,            // Assertions
  beforeEach,        // Setup before each test
  afterEach,         // Cleanup after each test
  beforeAll,         // Setup once before all tests
  afterAll,          // Cleanup once after all tests
  vi                 // Mocking utilities
} from 'vitest';
```

---

**Last Updated:** December 2025

**Questions?** See `/docs/implementation/IMPLEMENTATION_CHECKLIST.md` or ask the team.
