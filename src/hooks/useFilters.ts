/**
 * useFilters - Custom hook for managing filter state with URL synchronization
 *
 * Handles:
 * - Filter type state (all, adds, drops, adds-drops, no-drops) - synchronized via URL path
 * - Audience filter state (all, A, T, C) - synchronized via URL path
 * - Search term state - synchronized via URL query parameter (?search=term)
 * - URL path and query parsing
 * - Browser back/forward navigation
 * - Region-aware URL building (preserves /region/:region prefix)
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRegion } from '@/hooks/useRegion';
import { logger } from '@/lib/logger';
import { parseFilterPath, buildFilterPath, type Audience, type Filter } from '@/config/routeSchema';
import { trackEvent } from '@/lib/analytics';

export type FilterType = 'all' | 'adds' | 'drops' | 'adds-drops' | 'no-drops';
export type AudienceFilter = 'all' | 'A' | 'T' | 'C';

export interface UseFiltersReturn {
  /** Current filter type */
  filter: FilterType;
  /** Current audience filter */
  audienceFilter: AudienceFilter;
  /** Current search term */
  searchTerm: string;
  /** Update filter type */
  setFilter: (filter: FilterType) => void;
  /** Update audience filter */
  setAudienceFilter: (audience: AudienceFilter) => void;
  /** Update search term */
  setSearchTerm: (term: string) => void;
  /** Reset all filters to default */
  resetFilters: () => void;
}

/**
 * Map URL audience to internal audience filter code
 */
function audienceToFilter(audience: Audience | null): AudienceFilter {
  if (!audience) return 'all';
  const map: Record<Audience, AudienceFilter> = {
    adult: 'A',
    teen: 'T',
    children: 'C',
  };
  return map[audience];
}

/**
 * Map internal audience filter code to URL audience
 */
function filterToAudience(audienceFilter: AudienceFilter): Audience | null {
  if (audienceFilter === 'all') return null;
  const map: Record<Exclude<AudienceFilter, 'all'>, Audience> = {
    A: 'adult',
    T: 'teen',
    C: 'children',
  };
  return map[audienceFilter];
}

/**
 * Parse filter values from URL path using routeSchema
 */
function parseFiltersFromPath(pathname: string): { audience: AudienceFilter; filterType: FilterType } {
  const { audience, filter } = parseFilterPath(pathname);

  return {
    audience: audienceToFilter(audience),
    filterType: (filter || 'all') as FilterType,
  };
}

/**
 * Build URL path from filter values using routeSchema (region-aware)
 * Builds paths like: /region/pnba, /region/pnba/adult, /region/pnba/adult/adds
 */
function buildPathFromFilters(
  filterType: FilterType,
  audienceFilter: AudienceFilter,
  regionAbbr: string
): string {
  const audience = filterToAudience(audienceFilter);
  const filter = filterType === 'all' ? null : (filterType as Filter);

  const filterPath = buildFilterPath(audience, filter);
  const basePath = `/region/${regionAbbr.toLowerCase()}`;

  return filterPath ? `${basePath}/${filterPath}` : basePath;
}

/**
 * Hook for managing filter state with URL synchronization (region-aware)
 */
export function useFilters(): UseFiltersReturn {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentRegion } = useRegion();

  // Initialize filters from URL
  const initialFilters = parseFiltersFromPath(location.pathname);
  const searchParams = new URLSearchParams(location.search);
  const initialSearchTerm = searchParams.get('search') || '';

  const [filter, setFilterState] = useState<FilterType>(initialFilters.filterType);
  const [audienceFilter, setAudienceFilterState] = useState<AudienceFilter>(initialFilters.audience);
  const [searchTerm, setSearchTermState] = useState<string>(initialSearchTerm);

  /**
   * Update URL when filters change (preserving hash, updating search param)
   */
  const updateURL = (newFilter: FilterType, newAudienceFilter: AudienceFilter, newSearchTerm?: string) => {
    const path = buildPathFromFilters(newFilter, newAudienceFilter, currentRegion.abbreviation);
    const params = new URLSearchParams(location.search);

    // Update or remove search param
    const searchToUse = newSearchTerm !== undefined ? newSearchTerm : searchTerm;
    if (searchToUse) {
      params.set('search', searchToUse);
    } else {
      params.delete('search');
    }

    const queryString = params.toString();
    const fullPath = `${path}${queryString ? '?' + queryString : ''}${location.hash}`;
    logger.debug('[useFilters] Updating URL to:', fullPath);
    navigate(fullPath, { replace: true });
  };

  /**
   * Set filter type and update URL
   */
  const setFilter = (newFilter: FilterType) => {
    logger.debug('[useFilters] Setting filter to:', newFilter);
    setFilterState(newFilter);
    updateURL(newFilter, audienceFilter);
  };

  /**
   * Set audience filter and update URL
   */
  const setAudienceFilter = (newAudienceFilter: AudienceFilter) => {
    logger.debug('[useFilters] Setting audience filter to:', newAudienceFilter);
    setAudienceFilterState(newAudienceFilter);
    updateURL(filter, newAudienceFilter);
  };

  /**
   * Set search term and update URL
   */
  const setSearchTerm = (newSearchTerm: string) => {
    logger.debug('[useFilters] Setting search term to:', newSearchTerm);
    setSearchTermState(newSearchTerm);
    updateURL(filter, audienceFilter, newSearchTerm);
  };

  /**
   * Reset all filters to default
   */
  const resetFilters = () => {
    logger.debug('[useFilters] Resetting all filters');
    setFilterState('all');
    setAudienceFilterState('all');
    setSearchTermState('');
    updateURL('all', 'all', '');
  };

  /**
   * Sync filters with URL changes (browser back/forward)
   */
  useEffect(() => {
    const { audience, filterType } = parseFiltersFromPath(location.pathname);
    const params = new URLSearchParams(location.search);
    const urlSearchTerm = params.get('search') || '';

    logger.debug('[useFilters] URL changed, syncing filters:', { audience, filterType, search: urlSearchTerm });
    setFilterState(filterType);
    setAudienceFilterState(audience);
    setSearchTermState(urlSearchTerm);
  }, [location.pathname, location.search]);

  /**
   * Track filter changes
   */
  useEffect(() => {
    if (filter !== 'all' || audienceFilter !== 'all') {
      const audienceMap: Record<AudienceFilter, string> = {
        'all': 'all',
        'A': 'adult',
        'T': 'teen',
        'C': 'children'
      };

      trackEvent('filter_applied', {
        filter: filter as 'all' | 'adds' | 'drops' | 'adds_drops',
        audience: audienceMap[audienceFilter]
      });
    }
  }, [filter, audienceFilter]);

  return {
    filter,
    audienceFilter,
    searchTerm,
    setFilter,
    setAudienceFilter,
    setSearchTerm,
    resetFilters,
  };
}
