/**
 * MobileNav Component
 *
 * Mobile-optimized navigation menu with hamburger button and slide-out drawer.
 * Designed for screens smaller than md breakpoint.
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Book, Sparkles } from 'lucide-react';
import { useRegion } from '@/hooks/useRegion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RegionSelector } from './RegionSelector';
import { FilterAndExportControls } from './FilterAndExportControls';
import { ElsewhereFilters } from '@/components/ElsewhereFilters';
import { ElsewhereFilters as ElsewhereFiltersType } from '@/types/elsewhere';
import { REGIONS } from '@/config/regions';
import { cn } from '@/lib/utils';
import { isExactMatch, isRegionSection } from '@/utils/navigationHelpers';

export function MobileNav() {
  const { currentRegion } = useRegion();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Elsewhere filters state (for mobile drawer)
  // TODO: Sync with Elsewhere page filters via URL params for better UX
  const [elsewhereFilters, setElsewhereFilters] = useState<ElsewhereFiltersType>({
    targetRegion: currentRegion.abbreviation,
    comparisonRegions: REGIONS
      .filter(r => r.is_active && r.abbreviation !== currentRegion.abbreviation)
      .map(r => r.abbreviation),
    sortBy: 'most_regions',
  });

  const isElsewherePage = location.pathname.includes('/elsewhere');

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
  };

  const handleNavLinkClick = () => {
    setOpen(false);
  };

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" role="navigation">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Logo */}
          <Link
            to={`/region/${currentRegion.abbreviation.toLowerCase()}`}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label="Better Bestsellers home"
          >
            <div className="relative">
              <Book className="w-8 h-8 text-primary" />
              <Sparkles className="w-4 h-4 text-accent absolute -top-1 -right-1" />
            </div>
          </Link>

          {/* Right: Theme Toggle and Menu button */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                  <SheetDescription>
                    Navigate regions, adjust list filters, and manage your account from this panel.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-col gap-6 mt-6">
                  {/* Region Selector */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Region</h3>
                    <RegionSelector />
                  </div>

                  {/* Divider */}
                  <div className="border-t" />

                  {/* Navigation Links - Toggle Style */}
                  <div className="space-y-2">
                    <div className="inline-flex w-full items-center rounded-md border border-border bg-muted p-1">
                      <Link
                        to={`/region/${currentRegion.abbreviation.toLowerCase()}`}
                        onClick={handleNavLinkClick}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium transition-all cursor-pointer",
                          isRegionSection(location.pathname, `/region/${currentRegion.abbreviation.toLowerCase()}`)
                            ? 'bg-gradient-primary text-white shadow-sm'
                            : 'text-muted-foreground'
                        )}
                      >
                        Current
                      </Link>
                      <Link
                        to={`/region/${currentRegion.abbreviation.toLowerCase()}/elsewhere`}
                        onClick={handleNavLinkClick}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium transition-all cursor-pointer",
                          location.pathname.includes('/elsewhere')
                            ? 'bg-gradient-primary text-white shadow-sm'
                            : 'text-muted-foreground'
                        )}
                      >
                        Elsewhere
                      </Link>
                      <Link
                        to={`/region/${currentRegion.abbreviation.toLowerCase()}/unique`}
                        onClick={handleNavLinkClick}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium transition-all cursor-pointer",
                          location.pathname.includes('/unique')
                            ? 'bg-gradient-primary text-white shadow-sm'
                            : 'text-muted-foreground'
                        )}
                      >
                        Unique
                      </Link>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t" />

                  {/* Filter & Export Controls */}
                  <div className="space-y-2">
                    {isElsewherePage ? (
                      <ElsewhereFilters
                        filters={elsewhereFilters}
                        onFiltersChange={setElsewhereFilters}
                      />
                    ) : (
                      <FilterAndExportControls />
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t" />

                  {/* Account Section */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Account</h3>
                    {user ? (
                      <div className="space-y-2">
                        <p className="text-sm">Signed in as: {user.email}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSignOut}
                          className="w-full justify-start"
                        >
                          Sign Out
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                        <Link to="/auth" onClick={handleNavLinkClick}>Sign In</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
