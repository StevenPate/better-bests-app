// src/config/routeSchema.test.ts
import { describe, it, expect } from 'vitest';
import {
  AUDIENCES,
  FILTERS,
  generateRoutes,
  buildFilterPath,
  parseFilterPath,
  type Audience,
  type Filter,
} from './routeSchema';

describe('Route Schema Constants', () => {
  it('should have exactly 3 audience types', () => {
    expect(AUDIENCES).toHaveLength(3);
    expect(AUDIENCES).toEqual(['adult', 'teen', 'children']);
  });

  it('should have exactly 4 filter types', () => {
    expect(FILTERS).toHaveLength(4);
    expect(FILTERS).toEqual(['adds', 'drops', 'adds-drops', 'no-drops']);
  });
});

describe('generateRoutes', () => {
  it('should generate 19 total routes (4 filters + 3 audiences + 12 combinations)', () => {
    const routes = generateRoutes();
    expect(routes).toHaveLength(19);
  });

  it('should generate 4 filter-only routes', () => {
    const routes = generateRoutes();
    const filterRoutes = routes.filter(r => r.filter && !r.audience);
    expect(filterRoutes).toHaveLength(4);

    expect(filterRoutes).toContainEqual({ path: 'adds', filter: 'adds' });
    expect(filterRoutes).toContainEqual({ path: 'drops', filter: 'drops' });
    expect(filterRoutes).toContainEqual({ path: 'adds-drops', filter: 'adds-drops' });
    expect(filterRoutes).toContainEqual({ path: 'no-drops', filter: 'no-drops' });
  });

  it('should generate 3 audience-only routes', () => {
    const routes = generateRoutes();
    const audienceRoutes = routes.filter(r => r.audience && !r.filter);
    expect(audienceRoutes).toHaveLength(3);

    expect(audienceRoutes).toContainEqual({ path: 'adult', audience: 'adult' });
    expect(audienceRoutes).toContainEqual({ path: 'teen', audience: 'teen' });
    expect(audienceRoutes).toContainEqual({ path: 'children', audience: 'children' });
  });

  it('should generate 12 combined audience + filter routes', () => {
    const routes = generateRoutes();
    const combinedRoutes = routes.filter(r => r.audience && r.filter);
    expect(combinedRoutes).toHaveLength(12);
  });

  it('should generate all audience/filter combinations', () => {
    const routes = generateRoutes();

    // Test a sample of combinations
    expect(routes).toContainEqual({ path: 'adult/adds', audience: 'adult', filter: 'adds' });
    expect(routes).toContainEqual({ path: 'adult/drops', audience: 'adult', filter: 'drops' });
    expect(routes).toContainEqual({ path: 'teen/adds', audience: 'teen', filter: 'adds' });
    expect(routes).toContainEqual({ path: 'teen/no-drops', audience: 'teen', filter: 'no-drops' });
    expect(routes).toContainEqual({ path: 'children/adds-drops', audience: 'children', filter: 'adds-drops' });
  });

  it('should have unique path values for all routes', () => {
    const routes = generateRoutes();
    const paths = routes.map(r => r.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(routes.length);
  });
});

describe('buildFilterPath', () => {
  it('should build combined path when both audience and filter provided', () => {
    expect(buildFilterPath('adult', 'adds')).toBe('adult/adds');
    expect(buildFilterPath('teen', 'drops')).toBe('teen/drops');
    expect(buildFilterPath('children', 'adds-drops')).toBe('children/adds-drops');
  });

  it('should build audience-only path when filter is null', () => {
    expect(buildFilterPath('adult', null)).toBe('adult');
    expect(buildFilterPath('teen', null)).toBe('teen');
    expect(buildFilterPath('children', null)).toBe('children');
  });

  it('should build audience-only path when filter is undefined', () => {
    expect(buildFilterPath('adult', undefined)).toBe('adult');
    expect(buildFilterPath('teen', undefined)).toBe('teen');
  });

  it('should build filter-only path when audience is null', () => {
    expect(buildFilterPath(null, 'adds')).toBe('adds');
    expect(buildFilterPath(null, 'drops')).toBe('drops');
    expect(buildFilterPath(null, 'adds-drops')).toBe('adds-drops');
    expect(buildFilterPath(null, 'no-drops')).toBe('no-drops');
  });

  it('should build filter-only path when audience is undefined', () => {
    expect(buildFilterPath(undefined, 'adds')).toBe('adds');
    expect(buildFilterPath(undefined, 'drops')).toBe('drops');
  });

  it('should return empty string when both are null', () => {
    expect(buildFilterPath(null, null)).toBe('');
  });

  it('should return empty string when both are undefined', () => {
    expect(buildFilterPath(undefined, undefined)).toBe('');
  });

  it('should return empty string when no arguments provided', () => {
    expect(buildFilterPath()).toBe('');
  });

  it('should handle all valid audience types', () => {
    AUDIENCES.forEach(audience => {
      const path = buildFilterPath(audience, 'adds');
      expect(path).toBe(`${audience}/adds`);
    });
  });

  it('should handle all valid filter types', () => {
    FILTERS.forEach(filter => {
      const path = buildFilterPath('adult', filter);
      expect(path).toBe(`adult/${filter}`);
    });
  });
});

describe('parseFilterPath', () => {
  it('should parse combined audience and filter from full path', () => {
    expect(parseFilterPath('/region/pnba/adult/adds')).toEqual({
      audience: 'adult',
      filter: 'adds'
    });
    expect(parseFilterPath('/region/pnba/teen/drops')).toEqual({
      audience: 'teen',
      filter: 'drops'
    });
    expect(parseFilterPath('/region/pnba/children/adds-drops')).toEqual({
      audience: 'children',
      filter: 'adds-drops'
    });
  });

  it('should parse audience-only from path', () => {
    expect(parseFilterPath('/region/pnba/adult')).toEqual({
      audience: 'adult',
      filter: null
    });
    expect(parseFilterPath('/region/pnba/teen')).toEqual({
      audience: 'teen',
      filter: null
    });
    expect(parseFilterPath('/region/pnba/children')).toEqual({
      audience: 'children',
      filter: null
    });
  });

  it('should parse filter-only from path', () => {
    expect(parseFilterPath('/region/pnba/adds')).toEqual({
      audience: null,
      filter: 'adds'
    });
    expect(parseFilterPath('/region/pnba/drops')).toEqual({
      audience: null,
      filter: 'drops'
    });
    expect(parseFilterPath('/region/pnba/adds-drops')).toEqual({
      audience: null,
      filter: 'adds-drops'
    });
    expect(parseFilterPath('/region/pnba/no-drops')).toEqual({
      audience: null,
      filter: 'no-drops'
    });
  });

  it('should return null for both when base path only', () => {
    expect(parseFilterPath('/region/pnba')).toEqual({
      audience: null,
      filter: null
    });
  });

  it('should handle paths without region prefix', () => {
    expect(parseFilterPath('/adult/adds')).toEqual({
      audience: 'adult',
      filter: 'adds'
    });
    expect(parseFilterPath('adult/adds')).toEqual({
      audience: 'adult',
      filter: 'adds'
    });
  });

  it('should handle paths with trailing slashes', () => {
    expect(parseFilterPath('/region/pnba/adult/adds/')).toEqual({
      audience: 'adult',
      filter: 'adds'
    });
  });

  it('should handle different region codes', () => {
    expect(parseFilterPath('/region/pnw/adult/adds')).toEqual({
      audience: 'adult',
      filter: 'adds'
    });
    expect(parseFilterPath('/region/mountains/teen/drops')).toEqual({
      audience: 'teen',
      filter: 'drops'
    });
  });

  it('should return null for unrecognized audience', () => {
    expect(parseFilterPath('/region/pnba/invalid/adds')).toEqual({
      audience: null,
      filter: 'adds'
    });
  });

  it('should return null for unrecognized filter', () => {
    expect(parseFilterPath('/region/pnba/adult/invalid')).toEqual({
      audience: 'adult',
      filter: null
    });
  });

  it('should handle empty string', () => {
    expect(parseFilterPath('')).toEqual({
      audience: null,
      filter: null
    });
  });

  it('should handle root path', () => {
    expect(parseFilterPath('/')).toEqual({
      audience: null,
      filter: null
    });
  });

  it('should parse all valid audiences', () => {
    AUDIENCES.forEach(audience => {
      const result = parseFilterPath(`/region/pnba/${audience}`);
      expect(result.audience).toBe(audience);
      expect(result.filter).toBe(null);
    });
  });

  it('should parse all valid filters', () => {
    FILTERS.forEach(filter => {
      const result = parseFilterPath(`/region/pnba/${filter}`);
      expect(result.audience).toBe(null);
      expect(result.filter).toBe(filter);
    });
  });

  it('should parse all audience/filter combinations', () => {
    AUDIENCES.forEach(audience => {
      FILTERS.forEach(filter => {
        const result = parseFilterPath(`/region/pnba/${audience}/${filter}`);
        expect(result.audience).toBe(audience);
        expect(result.filter).toBe(filter);
      });
    });
  });
});

describe('Route Schema Integration', () => {
  it('should roundtrip: buildFilterPath -> parseFilterPath', () => {
    // Test combined paths
    AUDIENCES.forEach(audience => {
      FILTERS.forEach(filter => {
        const path = buildFilterPath(audience, filter);
        const parsed = parseFilterPath(`/region/pnba/${path}`);
        expect(parsed.audience).toBe(audience);
        expect(parsed.filter).toBe(filter);
      });
    });

    // Test audience-only paths
    AUDIENCES.forEach(audience => {
      const path = buildFilterPath(audience, null);
      const parsed = parseFilterPath(`/region/pnba/${path}`);
      expect(parsed.audience).toBe(audience);
      expect(parsed.filter).toBe(null);
    });

    // Test filter-only paths
    FILTERS.forEach(filter => {
      const path = buildFilterPath(null, filter);
      const parsed = parseFilterPath(`/region/pnba/${path}`);
      expect(parsed.audience).toBe(null);
      expect(parsed.filter).toBe(filter);
    });
  });

  it('should generate routes that match buildFilterPath outputs', () => {
    const routes = generateRoutes();

    routes.forEach(route => {
      const builtPath = buildFilterPath(route.audience ?? null, route.filter ?? null);
      expect(builtPath).toBe(route.path);
    });
  });
});
