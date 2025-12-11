/**
 * MainNav Component
 *
 * Desktop navigation menu with region selector, navigation links, theme toggle, and auth controls.
 * Designed for screens md and larger.
 */

import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Book, Sparkles } from 'lucide-react';
import { useRegion } from '@/hooks/useRegion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RegionSelector } from './RegionSelector';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';
import { isRegionSection } from '@/utils/navigationHelpers';

export function MainNav() {
  const { currentRegion } = useRegion();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
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

          {/* Center: Region Selector & Toggle Navigation */}
          <div className="flex items-center gap-4">
            <NavigationMenu>
              <NavigationMenuList>
                {/* Region Selector */}
                <NavigationMenuItem>
                  <RegionSelector />
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>

            {/* View Lists | Elsewhere | Unique Toggle */}
            <div className="inline-flex items-center rounded-md border border-border bg-muted p-1">
              <Link
                to={`/region/${currentRegion.abbreviation.toLowerCase()}`}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer",
                  isRegionSection(location.pathname, `/region/${currentRegion.abbreviation.toLowerCase()}`)
                    ? 'bg-gradient-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground [&:hover]:no-underline'
                )}
              >
                <BarChart3 className="w-4 h-4 mr-2" aria-hidden="true" />
                Current
              </Link>
              <Link
                to={`/region/${currentRegion.abbreviation.toLowerCase()}/elsewhere`}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer",
                  location.pathname.includes('/elsewhere')
                    ? 'bg-gradient-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground [&:hover]:no-underline'
                )}
              >
                Elsewhere
              </Link>
              <Link
                to={`/region/${currentRegion.abbreviation.toLowerCase()}/unique`}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer",
                  location.pathname.includes('/unique')
                    ? 'bg-gradient-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground [&:hover]:no-underline'
                )}
              >
                Unique
              </Link>
            </div>
          </div>

          {/* Right: Controls, Theme Toggle & Auth */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                aria-label="Sign out"
              >
                Sign Out
              </Button>
            ) : (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
