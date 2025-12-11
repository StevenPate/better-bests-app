import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { LoadingState } from "@/components/ui/status/LoadingState";
import { DEFAULT_REGION } from "@/config/regions";
import { generateRoutes } from "@/config/routeSchema";

// Lazy load all page components for better performance
const Index = lazy(() => import("./pages/Index"));
const BookDetail = lazy(() => import("./pages/BookDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth").then(module => ({ default: module.Auth })));
const About = lazy(() => import("./pages/About"));
const Elsewhere = lazy(() => import("./pages/Elsewhere"));
const RegionUnique = lazy(() => import("./pages/RegionUnique"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const Awards = lazy(() => import("./pages/Awards"));
const Methodology = lazy(() => import("./pages/Methodology"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data freshness - data updates weekly on Wednesdays
      staleTime: 10 * 60 * 1000,        // 10 minutes - data stays fresh longer
      gcTime: 60 * 60 * 1000,           // 1 hour - keep in cache for longer

      // Refetch behavior (disable aggressive refetching)
      refetchOnWindowFocus: false,      // Don't refetch on tab switch
      refetchOnReconnect: false,        // Don't refetch on network reconnect
      refetchOnMount: false,            // Don't refetch on component remount (navigation)

      // Error handling
      retry: 2,                          // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

/**
 * Legacy book route redirect component
 *
 * Redirects old `/book/:isbn` URLs to new region-scoped format
 * `/region/{region}/book/:isbn` for backwards compatibility with
 * bookmarked links and external references.
 *
 * @returns Navigate element redirecting to default region
 *
 * @example
 * ```tsx
 * // Old URL: /book/9781234567890
 * // Redirects to: /region/pnba/book/9781234567890
 * ```
 */
const LegacyBookRedirect = () => {
  const { isbn } = useParams();
  return <Navigate to={`/region/${DEFAULT_REGION.toLowerCase()}/book/${isbn}`} replace />;
};

/**
 * Legacy awards route redirect component
 *
 * Redirects old `/awards/:year` URLs to new `/review/:year` format
 * for backwards compatibility with bookmarked links.
 *
 * @returns Navigate element redirecting to review route
 *
 * @example
 * ```tsx
 * // Old URL: /awards/2025
 * // Redirects to: /review/2025
 * ```
 */
const LegacyAwardsRedirect = () => {
  const { year } = useParams();
  return <Navigate to={`/review/${year}`} replace />;
};

/**
 * Review default year redirect component
 *
 * Redirects `/review` to `/review/2025` (current year)
 * to provide a clean default route for the year-end review.
 *
 * @returns Navigate element redirecting to current year review
 *
 * @example
 * ```tsx
 * // URL: /review
 * // Redirects to: /review/2025
 * ```
 */
const ReviewDefaultRedirect = () => {
  return <Navigate to="/review/2025" replace />;
};

/**
 * Main application component
 *
 * Provides routing structure, authentication context, and query client
 * for the Better Bestsellers application. Supports region-scoped navigation
 * with filter/audience combinations and legacy route redirects.
 *
 * Features:
 * - Region-based routing (8 regional bestseller lists)
 * - Dynamic filter routes generated from schema
 * - React Query for data caching and state management
 * - Legacy URL backwards compatibility
 *
 * @returns Application root with routing and providers
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Suspense fallback={<LoadingState message="Loading page..." size="default" />}>
        <Routes>
          {/* Root redirect to default region */}
          <Route path="/" element={<Navigate to={`/region/${DEFAULT_REGION.toLowerCase()}`} replace />} />

          {/* Auth route - outside region context */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/about" element={<About />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/review" element={<ReviewDefaultRedirect />} />
          <Route path="/review/:year/:category?/:region?" element={<Awards />} />
          <Route path="/review/:year/methodology" element={<Methodology />} />

          {/* Legacy routes - for backwards compatibility */}
          <Route path="/awards/:year" element={<LegacyAwardsRedirect />} />
          <Route path="/book/:isbn" element={<LegacyBookRedirect />} />
          <Route path="/elsewhere" element={<Navigate to={`/region/${DEFAULT_REGION.toLowerCase()}/elsewhere`} replace />} />

          {/* All region-aware routes */}
          <Route path="/region/:region" element={<Layout />}>
            {/* Base route */}
            <Route index element={<Index />} />

            {/* Elsewhere discovery */}
            <Route path="elsewhere" element={<Elsewhere />} />

            {/* Unique books (not linked in nav yet) */}
            <Route path="unique" element={<RegionUnique />} />

            {/* Book detail */}
            <Route path="book/:isbn" element={<BookDetail />} />

            {/* Generated filter routes - from routeSchema */}
            {generateRoutes().map(({ path }) => (
              <Route key={path} path={path} element={<Index />} />
            ))}
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
