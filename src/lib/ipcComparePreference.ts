import { REGIONS, DEFAULT_REGION } from '@/config/regions';

/**
 * The region /indie-press compares titles against.
 *
 * Deliberately NOT `preferred-region`. That key drives which region the app
 * navigates to, and writing it from this page would silently move the viewer's
 * whole nav context because they wanted to compare one list against SIBA.
 */
export const IPC_COMPARE_KEY = 'ipc-compare-region';

/** The key RegionContext writes on every region switch. Read here, never written. */
const NAV_REGION_KEY = 'preferred-region';

const isRealRegion = (value: string | null): value is string =>
  Boolean(value) && REGIONS.some((r) => r.abbreviation === value);

/**
 * This page's own saved choice wins. Before the picker has ever been touched,
 * the region the viewer browses elsewhere is a better guess than a hardcoded
 * default. Failing both, the default region.
 *
 * Storage can be unavailable (private mode, blocked site data), so every access
 * is guarded — the default is always a usable answer.
 */
export function readCompareRegion(): string {
  try {
    const own = localStorage.getItem(IPC_COMPARE_KEY);
    if (isRealRegion(own)) return own;
    const nav = localStorage.getItem(NAV_REGION_KEY);
    if (isRealRegion(nav)) return nav;
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_REGION;
}

export function saveCompareRegion(region: string): void {
  try {
    localStorage.setItem(IPC_COMPARE_KEY, region);
  } catch {
    // A picker that cannot persist still works for this visit.
  }
}
