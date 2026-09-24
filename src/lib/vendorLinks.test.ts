import { describe, it, expect } from 'vitest';
import { normalizeIsbn13, vendorLinks } from './vendorLinks';

describe('normalizeIsbn13', () => {
  it('returns the digits of a bare ISBN-13', () => {
    expect(normalizeIsbn13('9780593321447')).toBe('9780593321447');
  });

  it('strips hyphens', () => {
    expect(normalizeIsbn13('978-0-593-32144-7')).toBe('9780593321447');
  });

  it('strips spaces', () => {
    expect(normalizeIsbn13(' 978 0593 32144 7 ')).toBe('9780593321447');
  });

  it('accepts the 979 prefix', () => {
    expect(normalizeIsbn13('9791234567896')).toBe('9791234567896');
  });

  it('returns null for an ISBN-10', () => {
    expect(normalizeIsbn13('0593321447')).toBeNull();
  });

  it('returns null for a 13-digit number that is not a 978/979 prefix', () => {
    expect(normalizeIsbn13('1234567890123')).toBeNull();
  });

  it('returns null for a too-long digit string', () => {
    expect(normalizeIsbn13('97805933214470')).toBeNull();
  });

  it('returns null for empty, null and undefined input', () => {
    expect(normalizeIsbn13('')).toBeNull();
    expect(normalizeIsbn13(null)).toBeNull();
    expect(normalizeIsbn13(undefined)).toBeNull();
  });
});

describe('vendorLinks', () => {
  it('returns iPage, PubEasy, Edelweiss and PRH in that order', () => {
    expect(vendorLinks('9780593321447').map((l) => l.label)).toEqual([
      'iPage',
      'PubEasy',
      'Edelweiss',
      'PRH',
    ]);
  });

  it('builds the iPage title-detail URL from the ISBN', () => {
    const ipage = vendorLinks('9780593321447').find((l) => l.label === 'iPage');
    expect(ipage?.href).toBe(
      'https://ipage.ingramcontent.com/ipage/servlet/ibg.common.titledetail.pd1000?ean_id=9780593321447'
    );
  });

  it('does not send iPage through the login page, which drops the query', () => {
    const ipage = vendorLinks('9780593321447').find((l) => l.label === 'iPage');
    expect(ipage?.href).not.toContain('li001.jsp');
  });

  it('builds the Edelweiss keyword-search hash route from the ISBN', () => {
    const edelweiss = vendorLinks('9780593321447').find((l) => l.label === 'Edelweiss');
    expect(edelweiss?.href).toBe('https://www.edelweiss.plus/#keywordSearch&q=9780593321447');
  });

  it('builds the PubEasy search URL scoped to the direct-publisher set', () => {
    const pubeasy = vendorLinks('9780593321447').find((l) => l.label === 'PubEasy');
    expect(pubeasy?.href).toBe(
      'https://pubeasy.com/product/list?aggregatorId=CDC%2CELSEVIER_US%2CHACH_US%2CHARPERUS%2CMGH_CA%2CMGH_US%2CMPS_US%2COUPUS%2CPRH_CA%2CPRH_US%2CSAGE_US%2CSCHOLASTIC_US%2CSSCA%2CSSUS&availability=available_not_yet_published&includeWholesaler=false&isbn=9780593321447&queryId=1767513476645&searchString=(is%3D9780593321447)%20AND%20(li%3D10%20OR%20li%3D11%20OR%20li%3D12%20OR%20li%3D20%20OR%20li%3D21%20OR%20li%3D22%20OR%20li%3D23%20OR%20li%3D30%20OR%20li%3D31%20OR%20li%3D32%20OR%20li%3D33%20OR%20li%3D45%20OR%20li%3D47%20OR%20li%3D97%20OR%20li%3D98)'
    );
  });

  it('puts the ISBN in both the PubEasy isbn param and its searchString', () => {
    const pubeasy = vendorLinks('9780593321447').find((l) => l.label === 'PubEasy');
    expect(pubeasy?.href).toContain('&isbn=9780593321447');
    expect(pubeasy?.href).toContain('searchString=(is%3D9780593321447)');
  });

  it('leaves the pre-encoded PubEasy params alone rather than double-encoding', () => {
    const pubeasy = vendorLinks('9780593321447').find((l) => l.label === 'PubEasy');
    expect(pubeasy?.href).not.toContain('%25');
  });

  it('builds the PRH Self Service search URL from the ISBN', () => {
    const prh = vendorLinks('9780593321447').find((l) => l.label === 'PRH');
    expect(prh?.href).toBe(
      'https://selfservice.penguinrandomhouse.biz/search?terms=9780593321447&sort=relevance_asc&filters='
    );
  });

  it('keeps the trailing empty filters param PRH expects', () => {
    const prh = vendorLinks('9780593321447').find((l) => l.label === 'PRH');
    expect(prh?.href).toMatch(/&filters=$/);
  });

  it('produces clean 13-digit URLs from a hyphenated ISBN', () => {
    for (const { href } of vendorLinks('978-0-593-32144-7')) {
      expect(href).not.toMatch(/-/);
    }
    expect(vendorLinks('978-0-593-32144-7')[0].href).toContain('9780593321447');
  });

  it('returns no links when the ISBN is not a valid ISBN-13', () => {
    expect(vendorLinks('0593321447')).toEqual([]);
    expect(vendorLinks('not an isbn')).toEqual([]);
    expect(vendorLinks('')).toEqual([]);
    expect(vendorLinks(null)).toEqual([]);
    expect(vendorLinks(undefined)).toEqual([]);
  });
});
