// src/components/Layout.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Layout } from './Layout';

// Mock Supabase client to prevent network calls
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
  },
}));

// Mock useIsMobile hook to default to desktop view
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const renderLayout = () => {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/region/pnba']}>
          <Routes>
            <Route path="/region/:region" element={<Layout />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('Layout', () => {
  it('should render navigation', () => {
    renderLayout();
    // MainNav and NavigationMenu both have navigation role
    const navElements = screen.getAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should render outlet for nested routes', () => {
    renderLayout();
    // Outlet will be tested via integration tests
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should render region selector', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /pnba/i })).toBeInTheDocument();
  });

  it('should render MobileNav when useIsMobile returns true', async () => {
    // Import the mock and override it for this test
    const useIsMobileMock = await import('@/hooks/use-mobile');
    vi.spyOn(useIsMobileMock, 'useIsMobile').mockReturnValue(true);

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/region/pnba']}>
            <Routes>
              <Route path="/region/:region" element={<Layout />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    // MobileNav shows menu button, MainNav does not
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();

    // Clean up the spy
    vi.restoreAllMocks();
  });
});
