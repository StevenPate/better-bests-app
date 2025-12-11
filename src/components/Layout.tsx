// src/components/Layout.tsx
import { Outlet } from 'react-router-dom';
import { RegionProvider } from '@/contexts/RegionContext';
import { MainNav } from '@/components/Navigation/MainNav';
import { MobileNav } from '@/components/Navigation/MobileNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { Footer } from '@/components/Footer';

/**
 * Main layout component for region-scoped pages
 *
 * Provides the common layout structure for all region-aware pages,
 * including responsive navigation, content area, and footer.
 * Wraps child routes with RegionProvider for region context access.
 *
 * Features:
 * - Responsive navigation (desktop MainNav, mobile MobileNav)
 * - Region context provider for child components
 * - Consistent header/footer across pages
 * - React Router Outlet for nested routes
 *
 * @returns Layout structure with navigation and content outlet
 */
export function Layout() {
  return (
    <RegionProvider>
      <LayoutContent />
    </RegionProvider>
  );
}

function LayoutContent() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Responsive Navigation */}
      {isMobile ? <MobileNav /> : <MainNav />}

      {/* Main content area */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
