import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ABA_REGION_CODES } from '@/config/abaRegions';
import { logError } from '@/lib/errors';

export interface AbaPresence {
  /** Distinct ABA regions the title charted in that week. */
  regions: Set<string>;
  /** Best (lowest) rank per region. */
  rankByRegion: Map<string, number>;
}

interface AbaRow {
  isbn: string | null;
  region: string | null;
  rank: number;
}

/**
 * Fold raw rows into one entry per ISBN.
 *
 * ABA stores every list membership, so a title can hold several rows inside a
 * single region — count the region once, and keep its best rank.
 */
export const summarizeAbaRows = (rows: AbaRow[]): Map<string, AbaPresence> => {
  const byIsbn = new Map<string, AbaPresence>();
  for (const { isbn, region, rank } of rows) {
    if (!isbn || !region) continue;
    let entry = byIsbn.get(isbn);
    if (!entry) {
      entry = { regions: new Set(), rankByRegion: new Map() };
      byIsbn.set(isbn, entry);
    }
    entry.regions.add(region);
    const best = entry.rankByRegion.get(region);
    if (best === undefined || rank < best) entry.rankByRegion.set(region, rank);
  }
  return byIsbn;
};

/**
 * Which ABA regions each of the given ISBNs charted in, for one week.
 *
 * Narrowing by ISBN is load-bearing, not an optimization: a whole week of ABA
 * rows is ~1,485 and would truncate silently at PostgREST's 1000-row default.
 * Filtering to the ~80 IPC ISBNs returns well under that.
 *
 * Filtering on ABA_REGION_CODES — the same allowlist as the Elsewhere/Unique
 * fence — also stops IPC counting itself as one of its own regions.
 *
 * One fetch serves every region the picker can select; switching regions does
 * no network work.
 */
export const useAbaRegionCounts = (isbns: string[], weekDate: string | undefined) => {
  const key = [...isbns].sort();
  return useQuery({
    queryKey: ['abaRegionCounts', weekDate, key],
    enabled: Boolean(weekDate) && isbns.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Map<string, AbaPresence>> => {
      const { data, error } = await supabase
        .from('regional_bestsellers')
        .select('isbn, region, rank')
        .eq('week_date', weekDate!)
        .in('region', ABA_REGION_CODES)
        .in('isbn', isbns);

      if (error) {
        logError('useAbaRegionCounts', error, { weekDate, isbnCount: isbns.length });
        throw error;
      }
      return summarizeAbaRows((data ?? []) as AbaRow[]);
    },
  });
};
