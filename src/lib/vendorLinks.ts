/**
 * Vendor lookup links built from a title's ISBN-13.
 *
 * These templates are ported verbatim from the cowork vault: iPage, PubEasy
 * and Edelweiss from the release-radar index
 * (projects/release-radar/scripts/config.py), PRH from
 * reference/isbn-lookups.md, which documents all four. They are already in
 * production there, so change them here only alongside that source.
 *
 * All three are login-gated: a link that bounces to a sign-in screen is a
 * missing session, not a broken template — signing in and re-opening the same
 * URL works. URLs are computed at render time and never stored.
 */

export interface VendorLink {
  label: string;
  href: string;
}

const ISBN13 = /^97[89]\d{10}$/;

/**
 * Reduce an ISBN to digits only and return it if it is a valid ISBN-13,
 * otherwise null.
 */
export const normalizeIsbn13 = (isbn: string | null | undefined): string | null => {
  const digits = (isbn ?? '').replace(/\D/g, '');
  return ISBN13.test(digits) ? digits : null;
};

/**
 * Ingram iPage title detail: stock across warehouses, price and discount,
 * on-order signals, return policy.
 *
 * Not `li001.jsp?query=` — that is the login page and it drops the query.
 */
export const ipageUrl = (isbn13: string) =>
  `https://ipage.ingramcontent.com/ipage/servlet/ibg.common.titledetail.pd1000?ean_id=${isbn13}`;

/**
 * PubEasy multi-publisher search, scoped to the publisher set PBN buys direct
 * from and filtered to "available or not yet published". Returns a single hit
 * when the ISBN is in any of those catalogs.
 *
 * The ISBN appears twice by design — once in `isbn` and once inside
 * `searchString`. Both constants below are already percent-encoded; they are
 * interpolated verbatim so nothing gets double-encoded.
 */
const PUBEASY_AGGREGATORS =
  'CDC%2CELSEVIER_US%2CHACH_US%2CHARPERUS%2CMGH_CA%2CMGH_US%2CMPS_US%2COUPUS' +
  '%2CPRH_CA%2CPRH_US%2CSAGE_US%2CSCHOLASTIC_US%2CSSCA%2CSSUS';

const PUBEASY_LINE_ITEMS =
  'li%3D10%20OR%20li%3D11%20OR%20li%3D12%20OR%20li%3D20%20OR%20li%3D21%20OR%20' +
  'li%3D22%20OR%20li%3D23%20OR%20li%3D30%20OR%20li%3D31%20OR%20li%3D32%20OR%20' +
  'li%3D33%20OR%20li%3D45%20OR%20li%3D47%20OR%20li%3D97%20OR%20li%3D98';

/** Session-scoped tracking value PubEasy ignores for new searches. */
const PUBEASY_QUERY_ID = '1767513476645';

export const pubeasyUrl = (isbn13: string) =>
  `https://pubeasy.com/product/list?aggregatorId=${PUBEASY_AGGREGATORS}` +
  `&availability=available_not_yet_published&includeWholesaler=false` +
  `&isbn=${isbn13}&queryId=${PUBEASY_QUERY_ID}` +
  `&searchString=(is%3D${isbn13})%20AND%20(${PUBEASY_LINE_ITEMS})`;

/**
 * Edelweiss+ keyword search: catalog research, marketing copy, comps, rep
 * notes. The `#` is a real client-side hash route — do not strip or encode it.
 */
export const edelweissUrl = (isbn13: string) =>
  `https://www.edelweiss.plus/#keywordSearch&q=${isbn13}`;

/**
 * Penguin Random House Self Service: confirms PRH ownership of a title, its
 * current availability and pub date, and preps a Penguin Wholesale order when
 * the discount or stock position beats Ingram.
 *
 * `filters` is intentionally empty — it is the unfiltered search.
 */
export const prhUrl = (isbn13: string) =>
  `https://selfservice.penguinrandomhouse.biz/search?terms=${isbn13}&sort=relevance_asc&filters=`;

/**
 * The vendor links for a title, or an empty array when the title has no
 * valid ISBN-13.
 */
export const vendorLinks = (isbn: string | null | undefined): VendorLink[] => {
  const isbn13 = normalizeIsbn13(isbn);
  if (!isbn13) return [];
  return [
    { label: 'iPage', href: ipageUrl(isbn13) },
    { label: 'PubEasy', href: pubeasyUrl(isbn13) },
    { label: 'Edelweiss', href: edelweissUrl(isbn13) },
    { label: 'PRH', href: prhUrl(isbn13) },
  ];
};
