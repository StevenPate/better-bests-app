// src/config/regions.ts
import { Region } from '@/types/region';

export const REGIONS: Region[] = [
  {
    abbreviation: 'PNBA',
    display_name: 'PNBA - Pacific Northwest',
    full_name: 'Pacific Northwest Booksellers Association',
    file_code: 'pn',
    is_active: true,
    display_order: 1,
    website_url: 'https://www.pnba.org/',
  },
  {
    abbreviation: 'CALIBAN',
    display_name: 'CALIBAN - Northern California',
    full_name: 'California Independent Booksellers Alliance (North)',
    file_code: 'nc',
    is_active: true,
    display_order: 2,
    website_url: 'https://www.caliballiance.org/',
  },
  {
    abbreviation: 'CALIBAS',
    display_name: 'CALIBAS - Southern California',
    full_name: 'California Independent Booksellers Alliance (South)',
    file_code: 'sc',
    is_active: true,
    display_order: 3,
    website_url: 'https://www.caliballiance.org/',
  },
  {
    abbreviation: 'GLIBA',
    display_name: 'GLIBA - Great Lakes',
    full_name: 'Great Lakes Independent Booksellers Association',
    file_code: 'gl',
    is_active: true,
    display_order: 4,
    website_url: 'https://www.gliba.org/',
  },
  {
    abbreviation: 'MPIBA',
    display_name: 'MPIBA - Mountains & Plains',
    full_name: 'Mountains & Plains Independent Booksellers Association',
    file_code: 'mp',
    is_active: true,
    display_order: 5,
    website_url: 'https://www.mountainsplains.org/',
  },
  {
    abbreviation: 'MIBA',
    display_name: 'MIBA - Midwest',
    full_name: 'Midwest Independent Booksellers Association',
    file_code: 'mw',
    is_active: true,
    display_order: 6,
    website_url: 'https://www.midwestbooksellers.org/',
  },
  {
    abbreviation: 'NAIBA',
    display_name: 'NAIBA - New Atlantic',
    full_name: 'New Atlantic Independent Booksellers Association',
    file_code: 'na',
    is_active: true,
    display_order: 7,
    website_url: 'https://www.naiba.com/',
  },
  {
    abbreviation: 'NEIBA',
    display_name: 'NEIBA - New England',
    full_name: 'New England Independent Booksellers Association',
    file_code: 'ne',
    is_active: true,
    display_order: 8,
    website_url: 'https://newenglandbooks.org/',
  },
  {
    abbreviation: 'SIBA',
    display_name: 'SIBA - Southern',
    full_name: 'Southern Independent Booksellers Alliance',
    file_code: 'si',
    is_active: true,
    display_order: 9,
    website_url: 'https://sibaweb.com/',
  },
];

export const DEFAULT_REGION = 'PNBA';

export function getRegionByAbbreviation(abbr: string): Region | null {
  return REGIONS.find(r => r.abbreviation === abbr) || null;
}

export function getRegionByFileCode(code: string): Region | null {
  return REGIONS.find(r => r.file_code === code) || null;
}
