// src/types/region.ts
export interface Region {
  abbreviation: string;
  display_name: string;
  full_name: string;
  file_code: string;
  is_active: boolean;
  display_order: number;
  website_url: string;
}

export const REGION_ABBREVIATIONS = [
  'PNBA',
  'CALIBAN',
  'CALIBAS',
  'GLIBA',
  'MPIBA',
  'NAIBA',
  'NEIBA',
  'SIBA',
] as const;

export type RegionAbbreviation = typeof REGION_ABBREVIATIONS[number];

export function isValidRegion(abbr: string): boolean {
  return REGION_ABBREVIATIONS.includes(abbr as RegionAbbreviation);
}
