/**
 * Performance Scoring Type Definitions
 *
 * See docs/plans/2025-11-08-performance-scoring-design.md
 */

export interface WeeklyScore {
  id?: number;
  isbn: string;
  region: string;
  weekDate: string;
  rank: number;
  category: string | null;
  listSize: number;
  points: number;
  createdAt?: string;
}

export interface BookPerformanceMetrics {
  isbn: string;
  year: number;
  totalScore: number;
  weeksOnChart: number;
  regionsAppeared: number;
  maxWeeklyScore: number;
  avgWeeklyScore: number;
  avgScorePerWeek: number;
  rsiVariance: number;
  updatedAt?: string;
}

export interface RegionalPerformance {
  isbn: string;
  region: string;
  year: number;
  regionalScore: number;
  regionalStrengthIndex: number;
  weeksOnChart: number;
  bestRank: number;
  avgRank: number;
  avgScorePerWeek: number;
}

export interface BookRanking {
  isbn: string;
  title: string;
  author: string;
  score: number;
  metadata: Record<string, any>;
}

export interface YearEndRankings {
  regionalTop10s: Record<string, BookRanking[]>;
  mostRegional: BookRanking[];
  mostNational: BookRanking[];
  mostEfficient: BookRanking[];
}

export type RankingCategory = 'regional_top10s' | 'most_regional' | 'most_national' | 'most_efficient';
