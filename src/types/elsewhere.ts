/**
 * Type definitions for Elsewhere discovery feature
 *
 * The Elsewhere feature identifies bestselling books from other regions
 * that have never appeared on the selected region's list.
 */

export type TrendDirection = 'rising' | 'stable' | 'falling' | 'new';

export type SortOption =
  | 'most_regions'     // Books appearing in most regions
  | 'best_rank'        // Books with highest ranks elsewhere
  | 'total_weeks'      // Books with most weeks on lists
  | 'newest';          // Recently appeared elsewhere

/**
 * Regional performance data for a book in a specific region
 */
export interface RegionalPerformance {
  region: string;                  // Region abbreviation (e.g., 'SIBA', 'GLIBA')
  currentRank: number | null;      // Current rank on list (null if dropped)
  weeksOnList: number;             // Total weeks this book appeared
  bestRank: number;                // Best rank achieved
  trend: TrendDirection;           // Performance trend
  category?: string;               // Category in this region
}

/**
 * Aggregate metrics across all regions
 */
export interface AggregateMetrics {
  totalRegions: number;            // Number of regions book appears in
  totalWeeksAcrossAllRegions: number; // Sum of weeks across all regions
  bestRankAchieved: number;        // Best rank across all regions
  averageRank: number;             // Average rank across regions
}

/**
 * Book data for Elsewhere discovery feature
 */
export interface ElsewhereBook {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  coverUrl?: string;               // Google Books cover image
  category?: string;               // Primary category
  audience?: string;               // A/T/C audience classification

  // Regional performance data
  regionalPerformance: RegionalPerformance[];

  // Aggregate metrics
  aggregateMetrics: AggregateMetrics;

  // Metadata
  firstSeenDate?: string;          // First appearance elsewhere (ISO date)
  lastSeenDate?: string;           // Most recent appearance (ISO date)
}

/**
 * Filters for Elsewhere discovery
 */
export interface ElsewhereFilters {
  // Target region (the region we're viewing from)
  targetRegion: string;

  // Comparison regions (which regions to include in search)
  comparisonRegions: string[];     // Empty = all regions except target

  // Category filters
  categories?: string[];           // Filter by specific categories

  // Audience filters
  audiences?: string[];            // Filter by audience (A/T/C)

  // Performance filters
  minWeeksOnList?: number;         // Minimum weeks required
  minRegions?: number;             // Minimum regions required

  // Time range filters
  showOnlyNewThisWeek?: boolean;   // Only books first seen in most recent week

  // Sorting
  sortBy: SortOption;
  sortDirection?: 'asc' | 'desc';  // Defaults to desc

  // Search
  search?: string;                 // Search title/author/ISBN

  // Pagination
  page?: number;                   // Current page (1-indexed)
  pageSize?: number;               // Results per page (default: 20)
}

/**
 * Response from Elsewhere data fetch
 */
export interface ElsewhereDataResponse {
  books: ElsewhereBook[];
  totalCount: number;
  availableRegions: string[];      // Regions with data available
  weekDate: string;                // Week date for this data (ISO)
  lastUpdated: string;             // Last data update timestamp
  page: number;                    // Current page number
  pageSize: number;                // Results per page
  totalPages: number;              // Total number of pages
}

/**
 * State for Elsewhere page
 */
export interface ElsewhereState {
  filters: ElsewhereFilters;
  isLoading: boolean;
  error: Error | null;
  data: ElsewhereDataResponse | null;
}

/**
 * Options for calculating trends
 */
export interface TrendCalculationOptions {
  currentRank: number | null;
  previousRank: number | null;
  weeksOnList: number;
}
