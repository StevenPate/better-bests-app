import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCompareRegion, saveCompareRegion, IPC_COMPARE_KEY } from './ipcComparePreference';
import { DEFAULT_REGION } from '@/config/regions';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readCompareRegion', () => {
  it('prefers this page\'s own saved choice', () => {
    localStorage.setItem(IPC_COMPARE_KEY, 'SIBA');
    localStorage.setItem('preferred-region', 'GLIBA');
    expect(readCompareRegion()).toBe('SIBA');
  });

  // Before the picker has ever been touched, the region the viewer browses
  // elsewhere is a better guess than a hardcoded default.
  it('falls back to the nav region preference', () => {
    localStorage.setItem('preferred-region', 'GLIBA');
    expect(readCompareRegion()).toBe('GLIBA');
  });

  it('falls back to the default region when nothing is stored', () => {
    expect(readCompareRegion()).toBe(DEFAULT_REGION);
  });

  it('ignores a stored value that is not a real region', () => {
    localStorage.setItem(IPC_COMPARE_KEY, 'ATLANTIS');
    expect(readCompareRegion()).toBe(DEFAULT_REGION);
  });

  it('ignores an unreal value in the nav preference too', () => {
    localStorage.setItem('preferred-region', 'ATLANTIS');
    expect(readCompareRegion()).toBe(DEFAULT_REGION);
  });

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readCompareRegion()).toBe(DEFAULT_REGION);
  });
});

describe('saveCompareRegion', () => {
  it('writes only this page\'s key, never the nav region', () => {
    localStorage.setItem('preferred-region', 'GLIBA');
    saveCompareRegion('PNBA');
    expect(localStorage.getItem(IPC_COMPARE_KEY)).toBe('PNBA');
    expect(localStorage.getItem('preferred-region')).toBe('GLIBA');
  });

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveCompareRegion('PNBA')).not.toThrow();
  });
});
