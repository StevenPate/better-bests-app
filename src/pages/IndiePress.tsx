// src/pages/IndiePress.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Book, Sparkles } from 'lucide-react';
import { fetchBestsellerListFromDb } from '@/services/bestsellerApi';
import { BookListDisplay } from '@/components/BookListDisplay';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/status';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Footer } from '@/components/Footer';
import { RegionProvider } from '@/contexts/RegionContext';
import { IPC_REGION } from '@/config/abaRegions';

/**
 * fetchBestsellerListFromDb throws rather than returning empty when a region
 * has no stored rows. Recognise that specific case so it can be presented as
 * "not ingested yet" rather than as a failure — and not retried.
 */
function isNotIngestedError(err: unknown): boolean {
  return err instanceof Error && /No bestseller data stored/i.test(err.message);
}

const CATEGORY_LABELS: Record<string, string> = {
  FICTION: 'Fiction',
  NONFICTION: 'Nonfiction',
};

/**
 * `week_date` is a date-only ISO string. `new Date('2026-09-23')` parses as UTC
 * midnight, which renders as the 22nd anywhere west of Greenwich — so pin it to
 * local midnight before formatting.
 */
function formatWeekDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
}

/**
 * The Independent Press Top 40 — a national list from the Independent
 * Publishers Caucus, not an ABA region. It lives outside the /region/:region
 * layout on purpose: there is no region to select, so it carries its own
 * lightweight header the way /about does.
 */
export default function IndiePress() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['ipcList'],
    queryFn: () => fetchBestsellerListFromDb({ region: IPC_REGION }),
    staleTime: 30 * 60 * 1000,
    // The app retries twice by default. An un-ingested region is not a
    // transient failure — retrying it just delays the empty state by several
    // seconds while the page sits in a misleading in-between render.
    retry: (failureCount, err) => !isNotIngestedError(err) && failureCount < 2,
  });

  const notYetIngested = isNotIngestedError(error);

  const display = data && {
    ...data.current,
    title: 'Independent Press Top 40',
    categories: data.current.categories.map((c) => ({
      ...c,
      name: CATEGORY_LABELS[c.name] ?? c.name,
    })),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Book className="w-8 h-8 text-primary" />
              <Sparkles className="w-4 h-4 text-accent absolute -top-1 -right-1" />
            </div>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Independent Press Top 40</h1>
          {data && (
            <p className="text-muted-foreground">
              National bestsellers from independent publishers, week of{' '}
              {formatWeekDate(data.weekDate)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Published weekly by the{' '}
            <a
              href="https://www.indiepubs.org/top40"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Independent Publishers Caucus
            </a>
          </p>
        </div>

        {isPending && <LoadingState message="Loading Independent Press Top 40..." />}

        {/* "Nothing ingested yet" is the expected state until the backfill
            runs, not a failure — fetchBestsellerListFromDb throws for it the
            same as for a real outage, so separate the two rather than showing
            an alarming red box for a perfectly normal empty database. */}
        {!isPending && notYetIngested && (
          <EmptyState
            title="No Independent Press Top 40 data yet"
            description="The weekly ingest has not stored a list for this region. It runs Thursday mornings Pacific."
            actions={[{ label: 'Check again', onClick: () => refetch(), variant: 'outline' }]}
          />
        )}

        {!isPending && !notYetIngested && (error || !display) && (
          <ErrorState
            title="Failed to load the Independent Press Top 40"
            description={error instanceof Error ? error.message : 'Unknown error'}
            onRetry={() => refetch()}
          />
        )}

        {/* BookListDisplay -> BestsellerTable calls useRegion(), which throws
            without a RegionProvider. The provider normally comes from the
            /region/:region Layout, and this page sits outside it by design.
            With no :region param the provider falls back to the default region
            and its redirect effect stays inert, so this is just satisfying the
            contract — currentRegion is only read by the staff switch hook,
            which renders nothing here (isPbnStaff={false}). */}
        {!isPending && !error && display && (
          <RegionProvider>
            <BookListDisplay
              bestsellerData={display}
              filter="all"
              audienceFilter="all"
              searchTerm=""
              bookAudiences={{}}
              isPbnStaff={false}
              onSwitchingDataClear={() => {}}
            />
          </RegionProvider>
        )}
      </main>

      <Footer />
    </div>
  );
}
