/** ABA's URL slug for each region, paired with the code our DB already uses. */
export const REGION_SLUGS = [
  { slug: "gliba", db: "GLIBA" },
  { slug: "miba", db: "MIBA" },
  { slug: "mpiba", db: "MPIBA" },
  { slug: "naiba", db: "NAIBA" },
  { slug: "neiba", db: "NEIBA" },
  { slug: "pnba", db: "PNBA" },
  { slug: "siba", db: "SIBA" },
  // ABA renamed the California regions. We keep the legacy DB codes and
  // translate here; a real migration is deferred. See the design doc.
  { slug: "nciba", db: "CALIBAN" },
  { slug: "sciba", db: "CALIBAS" },
] as const;

export function dbRegionForSlug(slug: string): string | null {
  return REGION_SLUGS.find((r) => r.slug === slug)?.db ?? null;
}

/** Sentinel for tabs we deliberately do not ingest. */
export const SKIP = "SKIP";

/** Normalized tab name -> DB category. Keys are lowercase, single-spaced. */
const TAB_TO_CATEGORY: Record<string, string> = {
  "hardcover fiction": "HARDCOVER FICTION",
  "hardcover nonfiction": "HARDCOVER NONFICTION",
  "paperback fiction": "TRADE PAPERBACK FICTION",
  "paperback nonfiction": "TRADE PAPERBACK NONFICTION",
  "mass market paperback": "MASS MARKET",
  "childrens illustrated": "CHILDREN'S ILLUSTRATED",
  "childrens interest": "CHILDREN'S INTEREST",
  "childrens titles": "CHILDREN'S TITLES",
  "childrens series titles": "CHILDREN'S SERIES TITLES",
  "early and middle grade": "EARLY & MIDDLE GRADE READERS",
  "young adult": "YOUNG ADULT",
  // Series-level list: columns are Rank, Series, Author, Publisher — no ISBN,
  // and regional_bestsellers.isbn is NOT NULL. Deliberately not ingested.
  "childrens series": SKIP,
  // Validation only; handled separately.
  "report details": SKIP,
};

function normalizeTab(tab: string): string {
  return tab.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns the DB category, the SKIP sentinel, or null when the tab is
 * unrecognized. Callers MUST treat null as a hard failure — silently skipping
 * unknown tabs is how category drift went unnoticed in August 2026.
 */
export function dbCategoryForTab(tab: string): string | null {
  return TAB_TO_CATEGORY[normalizeTab(tab)] ?? null;
}
