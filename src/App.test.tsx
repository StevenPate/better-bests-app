// src/App.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import App from './App';

// Mock Supabase client to prevent network calls
vi.mock('@/integrations/supabase/client', () => {
  const createQueryBuilder = (payload: any = null) => {
    const resolvedValue = { data: [], error: null, count: 0 };
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lt: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: payload, error: null })),
      // Make builder thenable so await resolves to empty result
      then: (resolve: any, reject: any) => Promise.resolve(resolvedValue).then(resolve, reject),
    };
    return builder;
  };

  return {
    supabase: {
      auth: {
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      },
      functions: {
        invoke: vi.fn(() => Promise.resolve({
          data: { success: true, books: [], totalRegionalBooks: 0, pnbaIsbnsCount: 0 },
          error: null,
        })),
      },
      from: vi.fn(() => createQueryBuilder()),
    },
  };
});

// Mock BestsellerParser to prevent data fetching during routing tests
vi.mock('@/utils/bestsellerParser', () => ({
  BestsellerParser: class {
    static fetchBestsellerData = vi.fn(() => Promise.resolve({
      current: {
        date: '2024-01-03',
        categories: [],
      },
      previous: {
        date: '2023-12-27',
        categories: [],
      },
      adds: [],
      drops: [],
    }));
    static shouldFetchNewData = vi.fn(() => Promise.resolve(false));
    static fetchHistoricalData = vi.fn(() => Promise.resolve());
    static getBookHistory = vi.fn(() => Promise.resolve([]));
    static getBookAudience = vi.fn(() => Promise.resolve(null));
  },
}));

const renderApp = (initialPath: string) => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('App Routing', () => {
  it('should redirect root to default region', async () => {
    renderApp('/');
    // Should redirect to /region/pnba and render the layout
    // Wait for the navigation and layout to render (MainNav + NavigationMenu both have navigation role)
    const navElements = await screen.findAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
    // Check for PNBA region selector button which proves we're on /region/pnba
    expect(screen.getByRole('button', { name: /pnba/i })).toBeInTheDocument();
  });

  it('should render region routes', async () => {
    renderApp('/region/pnba');
    // Wait for async rendering and check that Layout rendered
    const navElements = await screen.findAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
    // Check for PNBA region selector button
    expect(screen.getByRole('button', { name: /pnba/i })).toBeInTheDocument();
  });

  it('should handle region with filter routes', async () => {
    renderApp('/region/pnba/adds');
    // Layout should render even if Index has issues
    const navElements = await screen.findAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle region with audience routes', async () => {
    renderApp('/region/pnba/adult');
    // Layout should render even if Index has issues
    const navElements = await screen.findAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle region with audience and filter routes', async () => {
    renderApp('/region/pnba/adult/adds');
    // Layout should render even if Index has issues
    const navElements = await screen.findAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle auth route outside region context', async () => {
    renderApp('/auth');
    // Check for the signin email input field which is unique to auth page
    // Wait for lazy-loaded Auth component to render
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
  });

  it('should handle elsewhere route outside region context', async () => {
    renderApp('/elsewhere');
    // Elsewhere is region-independent and should render its heading
    expect(await screen.findByText(/books from elsewhere/i)).toBeInTheDocument();
  });

  it('should handle book detail routes with region', async () => {
    renderApp('/region/pnba/book/9780123456789');
    // Wait for lazy-loaded BookDetail component and Layout to render
    const navElements = await screen.findAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should redirect /review to current year review page', async () => {
    renderApp('/review');
    // The ReviewDefaultRedirect should redirect to /review/{currentYear}
    // which renders the Awards page with Year in Review heading
    expect(await screen.findByText(/year in review/i)).toBeInTheDocument();
  });

  it('should handle 404 for invalid routes', async () => {
    renderApp('/invalid-route');
    // Wait for lazy-loaded NotFound component to render
    expect(await screen.findByText(/404/i)).toBeInTheDocument();
  });
});
