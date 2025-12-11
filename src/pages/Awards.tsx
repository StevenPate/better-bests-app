import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useYearEndRankings } from '@/hooks/useYearEndRankings';
import { usePublicationYears } from '@/hooks/usePublicationYears';
import { HeroSection } from '@/components/YearEndRankings/HeroSection';
import { TopBooksSpotlight } from '@/components/YearEndRankings/TopBooksSpotlight';
import { RankingList } from '@/components/YearEndRankings/EnhancedRankingCard';
import { CategoryNav, getCategoryInfo, type CategoryType } from '@/components/YearEndRankings/CategoryNav';
import { MethodologyFooter } from '@/components/YearEndRankings/MethodologyFooter';
import { FrontlistToggle } from '@/components/YearEndRankings/FrontlistToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BookRanking } from '@/types/performance';
import { Footer } from '@/components/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Book, Sparkles } from 'lucide-react';

// URL slug to CategoryType mapping
const CATEGORY_SLUGS: Record<string, CategoryType> = {
  'most-regional': 'most_regional',
  'regional-top10s': 'regional_top10s',
  'most-national': 'most_national',
  'most-efficient': 'most_efficient',
};

const CATEGORY_TO_SLUG: Record<CategoryType, string> = {
  'overview': 'overview',
  'most_regional': 'most-regional',
  'regional_top10s': 'regional-top10s',
  'most_national': 'most-national',
  'most_efficient': 'most-efficient',
};

const REGIONS = [
  { code: 'PNBA', name: 'Pacific Northwest' },
  { code: 'CALIBAN', name: 'Northern California' },
  { code: 'CALIBAS', name: 'Southern California' },
  { code: 'GLIBA', name: 'Great Lakes' },
  { code: 'MPIBA', name: 'Mountains & Plains' },
  { code: 'NAIBA', name: 'New Atlantic' },
  { code: 'NEIBA', name: 'New England' },
  { code: 'SIBA', name: 'Southern' },
];

const FRONTLIST_YEARS = [2024, 2025];

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

function RankingDisplay({ books, subtitle }: { books: BookRanking[]; subtitle?: string }) {
  if (books.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No books match the current filter
      </p>
    );
  }

  return (
    <>
      <TopBooksSpotlight books={books} title="" subtitle={subtitle} />
      {books.length > 3 && (
        <RankingList rankings={books.slice(3)} startRank={4} />
      )}
    </>
  );
}

interface CategoryContentProps {
  category: CategoryType;
  year: number;
  mostRegionalByRegion?: Record<string, BookRanking[]>;
  regionalTop10sByRegion?: Record<string, BookRanking[]>;
  regionalTop10sLoading: boolean;
  frontlistEnabled: boolean;
  publicationYears: Map<string, { publishedYear: number | null }>;
  pubYearsLoading: boolean;
  activeRegion: string;
  onRegionChange: (region: string) => void;
}

function filterBooks(
  books: BookRanking[],
  frontlistEnabled: boolean,
  publicationYears: Map<string, { publishedYear: number | null }>,
  limit: number = 10
): BookRanking[] {
  let filtered = books;

  // Apply frontlist filter
  if (frontlistEnabled) {
    filtered = filtered.filter((book) => {
      const pubInfo = publicationYears.get(book.isbn);
      if (!pubInfo?.publishedYear) return false;
      return FRONTLIST_YEARS.includes(pubInfo.publishedYear);
    });
  }

  return filtered.slice(0, limit);
}

function CategoryContent({
  category,
  year,
  mostRegionalByRegion,
  regionalTop10sByRegion,
  regionalTop10sLoading,
  frontlistEnabled,
  publicationYears,
  pubYearsLoading,
  activeRegion,
  onRegionChange,
}: CategoryContentProps) {

  // No longer needed - we use pre-fetched data from regionalTop10sByRegion
  // const { data: regionalTop10, isLoading: regionalLoading } = useYearEndRankings(
  //   'regional_top10s',
  //   year,
  //   category === 'regional_top10s' ? activeRegion : undefined
  // );

  const { data: mostNational, isLoading: nationalLoading } = useYearEndRankings(
    'most_national',
    year
  );

  const { data: mostEfficient, isLoading: efficientLoading } = useYearEndRankings(
    'most_efficient',
    year
  );

  const categoryInfo = getCategoryInfo(category);

  // Show loading if we're waiting for filter data
  const showFilterLoading = frontlistEnabled && pubYearsLoading;

  if (category === 'most_regional' && mostRegionalByRegion) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{categoryInfo?.label}</h2>
          <p className="text-muted-foreground mt-1">{categoryInfo?.description}</p>
        </div>

        <Tabs value={activeRegion} onValueChange={onRegionChange}>
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-6">
            {REGIONS.map((region) => (
              <TabsTrigger key={region.code} value={region.code} className="text-xs sm:text-sm">
                {region.code}
              </TabsTrigger>
            ))}
          </TabsList>

          {REGIONS.map((region) => {
            const regionalData = mostRegionalByRegion[region.code] || [];
            const filteredData = filterBooks(regionalData, frontlistEnabled, publicationYears);

            return (
              <TabsContent key={region.code} value={region.code} className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-muted-foreground">{region.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Books where regional performance in {region.code} had the greatest impact
                  </p>
                </div>

                {showFilterLoading ? (
                  <LoadingSkeleton />
                ) : (
                  <RankingDisplay books={filteredData} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    );
  }

  if (category === 'regional_top10s' && regionalTop10sByRegion) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{categoryInfo?.label}</h2>
          <p className="text-muted-foreground mt-1">{categoryInfo?.description}</p>
        </div>

        <Tabs value={activeRegion} onValueChange={onRegionChange}>
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-6">
            {REGIONS.map((region) => (
              <TabsTrigger key={region.code} value={region.code} className="text-xs sm:text-sm">
                {region.code}
              </TabsTrigger>
            ))}
          </TabsList>

          {REGIONS.map((region) => {
            const regionalData = regionalTop10sByRegion[region.code] || [];
            const filteredData = filterBooks(regionalData, frontlistEnabled, publicationYears);

            return (
              <TabsContent key={region.code} value={region.code} className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-muted-foreground">{region.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Top performers by total regional score
                  </p>
                </div>

                {showFilterLoading || regionalTop10sLoading ? (
                  <LoadingSkeleton />
                ) : (
                  <RankingDisplay books={filteredData} />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    );
  }

  if (category === 'most_national') {
    const filteredNational = mostNational
      ? filterBooks(mostNational, frontlistEnabled, publicationYears, 20)
      : [];

    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{categoryInfo?.label}</h2>
          <p className="text-muted-foreground mt-1">{categoryInfo?.description}</p>
        </div>

        {nationalLoading || showFilterLoading ? (
          <LoadingSkeleton />
        ) : (
          <RankingDisplay books={filteredNational} />
        )}
      </div>
    );
  }

  if (category === 'most_efficient') {
    const filteredEfficient = mostEfficient
      ? filterBooks(mostEfficient, frontlistEnabled, publicationYears, 20)
      : [];

    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{categoryInfo?.label}</h2>
          <p className="text-muted-foreground mt-1">{categoryInfo?.description}</p>
        </div>

        {efficientLoading || showFilterLoading ? (
          <LoadingSkeleton />
        ) : (
          <RankingDisplay books={filteredEfficient} />
        )}
      </div>
    );
  }

  return null;
}

export default function Awards() {
  const { year: yearParam, category: categoryParam, region: regionParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const year = yearParam ? parseInt(yearParam) : 2025;

  // Parse category from URL slug (defaults to 'most_regional')
  const categoryFromUrl = categoryParam ? CATEGORY_SLUGS[categoryParam] : undefined;
  const [activeCategory, setActiveCategoryState] = useState<CategoryType>(
    categoryFromUrl || 'most_regional'
  );

  // Parse region from URL (defaults to 'PNBA', uppercase)
  const [activeRegion, setActiveRegionState] = useState<string>(
    regionParam?.toUpperCase() || 'PNBA'
  );

  // Parse filters from search params
  const [frontlistEnabled, setFrontlistEnabledState] = useState(
    searchParams.get('frontlist') === 'true'
  );

  // Sync category from URL on mount or URL change
  useEffect(() => {
    if (categoryParam) {
      const category = CATEGORY_SLUGS[categoryParam];
      if (category && category !== activeCategory) {
        setActiveCategoryState(category);
      }
    }
  }, [categoryParam, activeCategory]);

  // Sync region from URL on mount or URL change
  useEffect(() => {
    if (regionParam) {
      const region = regionParam.toUpperCase();
      if (region !== activeRegion) {
        setActiveRegionState(region);
      }
    }
  }, [regionParam, activeRegion]);

  // Build URL path based on current state
  const buildUrl = useCallback((
    cat: CategoryType,
    reg?: string,
    filters?: { frontlist?: boolean }
  ) => {
    const catSlug = CATEGORY_TO_SLUG[cat];
    const needsRegion = cat === 'most_regional' || cat === 'regional_top10s';

    let path = `/review/${year}/${catSlug}`;
    if (needsRegion && reg) {
      path += `/${reg.toLowerCase()}`;
    }

    // Build search params
    const params = new URLSearchParams();
    const fl = filters?.frontlist ?? frontlistEnabled;

    if (fl) params.set('frontlist', 'true');

    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  }, [year, frontlistEnabled]);

  // Handler to update category and URL
  const setActiveCategory = useCallback((cat: CategoryType) => {
    setActiveCategoryState(cat);
    const needsRegion = cat === 'most_regional' || cat === 'regional_top10s';
    navigate(buildUrl(cat, needsRegion ? activeRegion : undefined), { replace: true });
  }, [navigate, buildUrl, activeRegion]);

  // Handler to update region and URL
  const setActiveRegion = useCallback((reg: string) => {
    setActiveRegionState(reg);
    navigate(buildUrl(activeCategory, reg), { replace: true });
  }, [navigate, buildUrl, activeCategory]);

  // Handler to update frontlist filter and URL
  const setFrontlistEnabled = useCallback((enabled: boolean) => {
    setFrontlistEnabledState(enabled);
    const needsRegion = activeCategory === 'most_regional' || activeCategory === 'regional_top10s';
    navigate(buildUrl(activeCategory, needsRegion ? activeRegion : undefined, { frontlist: enabled }), { replace: true });
  }, [navigate, buildUrl, activeCategory, activeRegion]);

  // Fetch all ranking data
  const { data: mostRegional, isLoading: regionalLoading } = useYearEndRankings('most_regional', year);
  const { data: mostNational } = useYearEndRankings('most_national', year);
  const { data: mostEfficient } = useYearEndRankings('most_efficient', year);

  // Fetch regional_top10s for ALL regions to include ISBNs in lookup
  // (hook requires explicit region param, so we fetch each separately)
  const { data: top10Pnba, isLoading: loadingPnba } = useYearEndRankings('regional_top10s', year, 'PNBA');
  const { data: top10Caliban, isLoading: loadingCaliban } = useYearEndRankings('regional_top10s', year, 'CALIBAN');
  const { data: top10Calibas, isLoading: loadingCalibas } = useYearEndRankings('regional_top10s', year, 'CALIBAS');
  const { data: top10Gliba, isLoading: loadingGliba } = useYearEndRankings('regional_top10s', year, 'GLIBA');
  const { data: top10Mpiba, isLoading: loadingMpiba } = useYearEndRankings('regional_top10s', year, 'MPIBA');
  const { data: top10Naiba, isLoading: loadingNaiba } = useYearEndRankings('regional_top10s', year, 'NAIBA');
  const { data: top10Neiba, isLoading: loadingNeiba } = useYearEndRankings('regional_top10s', year, 'NEIBA');
  const { data: top10Siba, isLoading: loadingSiba } = useYearEndRankings('regional_top10s', year, 'SIBA');

  const regionalTop10sLoading = loadingPnba
    || loadingCaliban
    || loadingCalibas
    || loadingGliba
    || loadingMpiba
    || loadingNaiba
    || loadingNeiba
    || loadingSiba;

  // Collect all unique ISBNs for publication year and audience lookup
  const allIsbns = useMemo(() => {
    const isbns = new Set<string>();
    mostRegional?.forEach((b) => isbns.add(b.isbn));
    mostNational?.forEach((b) => isbns.add(b.isbn));
    mostEfficient?.forEach((b) => isbns.add(b.isbn));
    // Include all regional_top10s ISBNs
    [top10Pnba, top10Caliban, top10Calibas, top10Gliba, top10Mpiba, top10Naiba, top10Neiba, top10Siba]
      .forEach((regionData) => regionData?.forEach((b) => isbns.add(b.isbn)));
    return Array.from(isbns);
  }, [mostRegional, mostNational, mostEfficient, top10Pnba, top10Caliban, top10Calibas, top10Gliba, top10Mpiba, top10Naiba, top10Neiba, top10Siba]);

  // Fetch publication years (only when frontlist filter is enabled)
  const { publicationYears, isLoading: pubYearsLoading } = usePublicationYears(
    frontlistEnabled ? allIsbns : []
  );

  // Group most_regional by region
  const mostRegionalByRegion = mostRegional?.reduce((acc, book) => {
    const region = book.metadata.region;
    if (!acc[region]) acc[region] = [];
    acc[region].push(book);
    return acc;
  }, {} as Record<string, typeof mostRegional>);

  // Group regional_top10s by region for CategoryContent
  const regionalTop10sByRegion: Record<string, BookRanking[]> = {
    PNBA: top10Pnba || [],
    CALIBAN: top10Caliban || [],
    CALIBAS: top10Calibas || [],
    GLIBA: top10Gliba || [],
    MPIBA: top10Mpiba || [],
    NAIBA: top10Naiba || [],
    NEIBA: top10Neiba || [],
    SIBA: top10Siba || [],
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Simple header with home link and theme toggle */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Book className="w-8 h-8 text-primary" />
              <Sparkles className="w-4 h-4 text-accent absolute -top-1 -right-1" />
            </div>
            <span className="text-xl font-bold">Better Bestsellers</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Hero Section */}
        <HeroSection
          year={year}
          stats={{
            totalRegions: 8,
            totalWeeks: 52,
            totalBooks: 847,
          }}
        />

        {/* Category Navigation + Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <CategoryNav
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <FrontlistToggle
              enabled={frontlistEnabled}
              onToggle={setFrontlistEnabled}
              isLoading={pubYearsLoading}
            />
          </div>
        </div>

        {/* Category Content */}
        <div className="min-h-[600px]">
          {regionalLoading && activeCategory === 'most_regional' ? (
            <LoadingSkeleton />
          ) : (
            <CategoryContent
              category={activeCategory}
              year={year}
              mostRegionalByRegion={mostRegionalByRegion}
              regionalTop10sByRegion={regionalTop10sByRegion}
              regionalTop10sLoading={regionalTop10sLoading}
              frontlistEnabled={frontlistEnabled}
              publicationYears={publicationYears}
              pubYearsLoading={pubYearsLoading}
              activeRegion={activeRegion}
              onRegionChange={setActiveRegion}
            />
          )}
        </div>

        {/* Methodology Footer */}
        <MethodologyFooter year={year} />
      </div>

      {/* Site Footer */}
      <Footer />
    </div>
  );
}
