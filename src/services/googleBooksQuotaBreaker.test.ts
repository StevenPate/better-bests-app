import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { quotaBreaker, fetchWithRetry } from './googleBooksCache';

// Reproduces the 2026-09-01 PDF hang: Google Books' anonymous daily quota
// was exhausted, every uncached ISBN 429'd, and fetchWithRetry backed off
// 1s+2s per ISBN — ~77 ISBNs made "Generate PDF" freeze for minutes.

const rateLimitError = () => Object.assign(new Error('429'), { status: 429 });

beforeEach(() => {
  quotaBreaker.reset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('quotaBreaker', () => {
  it('opens after three consecutive 429s', () => {
    expect(quotaBreaker.isOpen()).toBe(false);
    quotaBreaker.record429();
    quotaBreaker.record429();
    expect(quotaBreaker.isOpen()).toBe(false);
    quotaBreaker.record429();
    expect(quotaBreaker.isOpen()).toBe(true);
  });

  it('a success closes it again', () => {
    quotaBreaker.record429();
    quotaBreaker.record429();
    quotaBreaker.record429();
    quotaBreaker.recordSuccess();
    expect(quotaBreaker.isOpen()).toBe(false);
  });

  it('re-closes on its own after the cooldown', () => {
    for (let i = 0; i < 3; i++) quotaBreaker.record429();
    expect(quotaBreaker.isOpen()).toBe(true);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(quotaBreaker.isOpen()).toBe(false);
  });
});

describe('fetchWithRetry under quota exhaustion', () => {
  it('fails immediately without calling the fetcher when the breaker is open', async () => {
    for (let i = 0; i < 3; i++) quotaBreaker.record429();
    const fn = vi.fn();
    await expect(fetchWithRetry(fn)).rejects.toThrow(/quota/i);
    expect(fn).not.toHaveBeenCalled();
  });

  it('feeds consecutive 429s into the breaker so later calls short-circuit', async () => {
    const failing = vi.fn(async () => { throw rateLimitError(); });
    // Three calls, each exhausting retries with 429s (advance fake timers
    // through the backoff), should trip the breaker.
    for (let i = 0; i < 3; i++) {
      const p = fetchWithRetry(failing).catch(() => 'failed');
      await vi.runAllTimersAsync();
      expect(await p).toBe('failed');
    }
    expect(quotaBreaker.isOpen()).toBe(true);
    // Fourth call never reaches the network.
    const fn = vi.fn();
    await expect(fetchWithRetry(fn)).rejects.toThrow(/quota/i);
    expect(fn).not.toHaveBeenCalled();
  });

  it('a success resets the consecutive count', async () => {
    // Two 429s (retries=2 keeps the breaker below threshold), then a
    // success, then two more — never reaches three consecutive.
    const failing = vi.fn(async () => { throw rateLimitError(); });
    const p1 = fetchWithRetry(failing, 2).catch(() => {});
    await vi.runAllTimersAsync();
    await p1;
    await fetchWithRetry(async () => 'ok');
    const p2 = fetchWithRetry(failing, 2).catch(() => {});
    await vi.runAllTimersAsync();
    await p2;
    expect(quotaBreaker.isOpen()).toBe(false);
  });
});
