import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import IndiePress from './IndiePress';

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock('@/services/bestsellerApi', () => ({ fetchBestsellerListFromDb: mockFetch }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isPbnStaff: false, user: null }) }));

const mockGenerateAndDownload = vi.hoisted(() => vi.fn(() => ({
  filename: 'IPC_bs_adds_no_drops_20260925.csv',
  content: '',
  bookCount: 1,
})));
vi.mock('@/services/csvExporter', () => ({ generateAndDownloadCSV: mockGenerateAndDownload }));

// Keep the crossover query out of the tests that do not care about it, and
// make it deterministic for the ones that do.
const mockAbaCounts = vi.hoisted(() => vi.fn(() => ({ data: undefined })));
vi.mock('@/hooks/useAbaRegionCounts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAbaRegionCounts: mockAbaCounts,
}));

const listWithBooks = {
  current: {
    title: 'IPC Independent Bestsellers',
    date: '2026-09-23',
    categories: [
      {
        name: 'FICTION',
        books: [
          { rank: 1, title: 'A Novel', author: 'Someone', publisher: 'Indie', price: '', isbn: '9781000000001' },
        ],
      },
    ],
  },
  weekDate: '2026-09-23',
  comparisonWeek: '2026-09-16',
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={['/indie-press']}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IndiePress', () => {
  // This is the case the empty state hid. BookListDisplay -> BestsellerTable
  // calls useRegion(), which throws outside a RegionProvider — and the page
  // deliberately renders outside the /region/:region layout that supplies one.
  // With no data the table never mounts, so nothing catches it.
  it('renders the list without a RegionProvider above it in the route tree', async () => {
    mockFetch.mockResolvedValue(listWithBooks);

    render(<IndiePress />, { wrapper });

    await waitFor(() => expect(screen.getByText('A Novel')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Independent Press Top 40' })).toBeInTheDocument();
  });

  it('shows a neutral empty state when the region has no stored rows', async () => {
    mockFetch.mockRejectedValue(new Error('No bestseller data stored for region IPC'));

    render(<IndiePress />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('No Independent Press Top 40 data yet')).toBeInTheDocument()
    );
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
  });

  // A genuine failure IS retried twice (unlike the not-ingested case), so the
  // error state takes a few seconds of backoff to surface. That contrast is
  // the point: this test would pass in ~0ms if the retry predicate wrongly
  // treated every error as un-retryable.
  it('shows an error state for a genuine failure, after retrying', async () => {
    mockFetch.mockRejectedValue(new Error('network exploded'));

    render(<IndiePress />, { wrapper });

    await waitFor(
      () => expect(screen.getByText(/Failed to load the Independent Press Top 40/)).toBeInTheDocument(),
      { timeout: 10000 }
    );
    expect(screen.getByText('network exploded')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('IndiePress CSV export', () => {
  it('exports the current list with the publisher column filled in', async () => {
    mockFetch.mockResolvedValue(listWithBooks);

    render(<IndiePress />, { wrapper });
    await waitFor(() => expect(screen.getByText('A Novel')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Download the Independent Press Top 40 as a CSV/i }));

    expect(mockGenerateAndDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'IPC',
        type: 'adds_no_drops',
        includePublisher: true,
      })
    );
  });

  it('offers no CSV button before anything is ingested', async () => {
    mockFetch.mockRejectedValue(new Error('No bestseller data stored for region IPC'));

    render(<IndiePress />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('No Independent Press Top 40 data yet')).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();
  });
});

describe('IndiePress ABA crossover markers', () => {
  const presenceFor = (regions: string[], ranks: Record<string, number>) =>
    new Map([
      ['9781000000001', { regions: new Set(regions), rankByRegion: new Map(Object.entries(ranks)) }],
    ]);

  beforeEach(() => {
    mockFetch.mockResolvedValue(listWithBooks);
  });

  it('shows the spread and the rank in the default compare region', async () => {
    mockAbaCounts.mockReturnValue({ data: presenceFor(['PNBA', 'SIBA', 'NEIBA'], { PNBA: 3 }) });

    render(<IndiePress />, { wrapper });
    await waitFor(() => expect(screen.getByText('A Novel')).toBeInTheDocument());

    expect(screen.getByText(/3 regions/)).toBeInTheDocument();
    expect(screen.getByText(/PNBA #3/)).toBeInTheDocument();
  });

  it('flags a title charting elsewhere but not in the compare region', async () => {
    mockAbaCounts.mockReturnValue({ data: presenceFor(['SIBA', 'NEIBA'], { SIBA: 7 }) });

    render(<IndiePress />, { wrapper });
    await waitFor(() => expect(screen.getByText('A Novel')).toBeInTheDocument());

    expect(screen.getByText(/not PNBA/)).toBeInTheDocument();
  });

  it('renders the list unmarked when the crossover query fails', async () => {
    mockAbaCounts.mockReturnValue({ data: undefined });

    render(<IndiePress />, { wrapper });
    await waitFor(() => expect(screen.getByText('A Novel')).toBeInTheDocument());

    expect(screen.queryByText(/regions/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
  });

  it('offers a compare-region picker alongside the CSV button', async () => {
    mockAbaCounts.mockReturnValue({ data: presenceFor(['SIBA'], { SIBA: 7 }) });

    render(<IndiePress />, { wrapper });
    await waitFor(() => expect(screen.getByText('A Novel')).toBeInTheDocument());

    expect(
      screen.getByRole('combobox', { name: /Region to compare the list against/i })
    ).toBeInTheDocument();
  });
});
