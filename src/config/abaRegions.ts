import { REGIONS } from './regions';

/**
 * The region codes that represent ABA regional bestseller lists.
 *
 * `regional_bestsellers` also holds non-ABA pseudo-regions (currently 'IPC',
 * the Independent Press Top 40). Any query that means "the ABA regions" must
 * filter with this list rather than with `.neq('region', target)` or no filter
 * at all, both of which silently absorb every pseudo-region we ever add.
 *
 * Derived from REGIONS so there is one source of truth: adding a real region
 * there brings it here automatically.
 */
export const ABA_REGION_CODES: string[] = REGIONS.map((r) => r.abbreviation);

/**
 * The Independent Press Top 40 region code.
 *
 * Mirrors IPC_REGION in trigger/ipc/persist.ts, which the frontend cannot
 * import. The two must stay equal — it is the stored `region` value.
 */
export const IPC_REGION = 'IPC';

/** Pseudo-regions stored in regional_bestsellers that are NOT ABA lists. */
export const NON_ABA_REGION_CODES = [IPC_REGION] as const;
