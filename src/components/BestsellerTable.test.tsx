import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { BestsellerTable } from './BestsellerTable';
import type { BestsellerCategory } from '@/types/bestseller';

// Mock hooks with configurable returns
const mockToast = vi.fn();
const mockUseAuth = vi.fn(() => ({ isPbnStaff: false }));
const mockUseIsMobile = vi.fn(() => false);
const mockHandlePosChange = vi.fn();
const mockHandleShelfChange = vi.fn();
const mockBulkUpdateSwitches = vi.fn();
const mockClearAllSwitches = vi.fn();
const mockRetryLoad = vi.fn();
const mockUseBestsellerSwitches = vi.fn(() => ({
  posChecked: {},
  shelfChecked: {},
  loading: false,
  loadError: null,
  pendingSwitches: {},
  bulkPending: { pos: false, shelf: false },
  mutationStatus: {},
  retryLoad: mockRetryLoad,
  handlePosChange: mockHandlePosChange,
  handleShelfChange: mockHandleShelfChange,
  bulkUpdateSwitches: mockBulkUpdateSwitches,
  clearAllSwitches: mockClearAllSwitches,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useBestsellerSwitches', () => ({
  useBestsellerSwitches: () => mockUseBestsellerSwitches(),
}));

vi.mock('@/hooks/useRegion', () => ({
  useRegion: () => ({
    currentRegion: {
      abbreviation: 'PNBA',
      fullName: 'Pacific Northwest Booksellers Association',
      regionCode: 'pn',
    },
    setCurrentRegion: vi.fn(),
  }),
}));

// Mock BestsellerParser
vi.mock('@/utils/bestsellerParser', () => ({
  BestsellerParser: {
    getBookAudience: vi.fn().mockResolvedValue('A'),
    updateBookAudience: vi.fn().mockResolvedValue(undefined),
  },
}));

// Helper to wrap component with Router
const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('BestsellerTable', () => {
  let mockCategory: BestsellerCategory;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockToast.mockReset();
    mockUseAuth.mockReset();
    mockUseIsMobile.mockReset();
    mockHandlePosChange.mockReset();
    mockHandleShelfChange.mockReset();
    mockBulkUpdateSwitches.mockReset();
    mockClearAllSwitches.mockReset();
    mockRetryLoad.mockReset();
    mockUseBestsellerSwitches.mockReset();

    mockUseAuth.mockReturnValue({ isPbnStaff: false });
    mockUseIsMobile.mockReturnValue(false);
    mockUseBestsellerSwitches.mockReturnValue({
      posChecked: {},
      shelfChecked: {},
      loading: false,
      loadError: null,
      pendingSwitches: {},
      bulkPending: { pos: false, shelf: false },
      mutationStatus: {},
      retryLoad: mockRetryLoad,
      handlePosChange: mockHandlePosChange,
      handleShelfChange: mockHandleShelfChange,
      bulkUpdateSwitches: mockBulkUpdateSwitches,
      clearAllSwitches: mockClearAllSwitches,
    });

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    mockCategory = {
      name: 'Fiction',
      books: [
        {
          rank: 1,
          title: 'New Book',
          author: 'Author One',
          publisher: 'Publisher One',
          isbn: '9781234567890',
          price: '$30.00',
          isNew: true,
          wasDropped: false,
        },
        {
          rank: 2,
          title: 'Existing Book',
          author: 'Author Two',
          publisher: 'Publisher Two',
          isbn: '9781234567891',
          price: '$28.00',
          isNew: false,
          wasDropped: false,
          previousRank: 3,
        },
        {
          rank: 3,
          title: 'A Book Starting With Article',
          author: 'Author Three',
          publisher: 'Publisher Three',
          isbn: '9781234567892',
          price: '$25.00',
          isNew: false,
          wasDropped: false,
        },
        {
          rank: 0,
          title: 'Dropped Book',
          author: 'Author Four',
          publisher: 'Publisher Four',
          isbn: '9781234567893',
          price: '$20.00',
          isNew: false,
          wasDropped: true,
        },
      ],
    };
  });

  describe('staff switching controls', () => {
    it('disables POS checkbox when switch is pending', () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: null,
        pendingSwitches: { 'pos|9781234567890': true },
        bulkPending: { pos: false, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const row = screen.getByText('New Book').closest('tr');
      expect(row).toBeTruthy();
      if (row) {
        const checkbox = within(row).getByLabelText('POS switch loading, please wait') as HTMLButtonElement;
        expect(checkbox).toBeDisabled();
      }
    });

    it('shows bulk controls as disabled when loading', () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: true,
        loadError: null,
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const bulkCheckboxes = screen.getAllByLabelText('POS switches loading, please wait');
      bulkCheckboxes.forEach(checkbox => {
        expect((checkbox as HTMLButtonElement)).toBeDisabled();
      });
    });

    it('shows error alert when loadError is present', () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: 'Failed to load switch data',
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('Failed to load switch data')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('calls retryLoad when retry button is clicked', async () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: 'Network error',
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      expect(mockRetryLoad).toHaveBeenCalledTimes(1);
    });

    it('renders without error when mutation succeeds', () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: { '9781234567890': true },
        shelfChecked: {},
        loading: false,
        loadError: null,
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: { 'pos|9781234567890': 'success' },
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      // Just verify it renders without crashing when success status is set
      expect(() => renderWithRouter(<BestsellerTable category={mockCategory} />)).not.toThrow();
    });

    it('renders without error when mutation fails', () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: null,
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: { 'pos|9781234567890': 'error' },
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      // Just verify it renders without crashing when error status is set
      expect(() => renderWithRouter(<BestsellerTable category={mockCategory} />)).not.toThrow();
    });

    it('disables bulk checkboxes when bulk operation is pending', () => {
      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: null,
        pendingSwitches: {},
        bulkPending: { pos: true, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Bulk checkbox shows "loading, please wait" when bulkPending is true
      const bulkPosCheckboxes = screen.getAllByLabelText('POS switches loading, please wait');
      bulkPosCheckboxes.forEach(checkbox => {
        expect((checkbox as HTMLButtonElement)).toBeDisabled();
      });
    });

    it('calls handlePosChange when POS checkbox is clicked', async () => {
      const mockHandlePosChangeLocal = vi.fn().mockResolvedValue(undefined);

      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: null,
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChangeLocal,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitches,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const row = screen.getByText('New Book').closest('tr');
      expect(row).toBeTruthy();
      if (row) {
        // Checkbox aria-label is "Toggle POS for ${book.title}"
        const checkbox = within(row).getByLabelText('Toggle POS for New Book') as HTMLButtonElement;
        fireEvent.click(checkbox);

        await waitFor(() => {
          // handlePosChangeDB is called with (remoteKey, title, checked)
          expect(mockHandlePosChangeLocal).toHaveBeenCalledWith('9781234567890', 'New Book', true);
        });
      }
    });

    it('calls bulkUpdateSwitches when bulk checkbox is clicked', async () => {
      const mockBulkUpdateSwitchesLocal = vi.fn().mockResolvedValue(undefined);

      mockUseAuth.mockReturnValue({ isPbnStaff: true });
      mockUseBestsellerSwitches.mockReturnValue({
        posChecked: {},
        shelfChecked: {},
        loading: false,
        loadError: null,
        pendingSwitches: {},
        bulkPending: { pos: false, shelf: false },
        mutationStatus: {},
        retryLoad: mockRetryLoad,
        handlePosChange: mockHandlePosChange,
        handleShelfChange: mockHandleShelfChange,
        bulkUpdateSwitches: mockBulkUpdateSwitchesLocal,
        clearAllSwitches: mockClearAllSwitches,
      });

      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Bulk checkbox aria-label is "Toggle all POS switches" when not pending
      const bulkCheckbox = screen.getAllByLabelText('Toggle all POS switches')[0] as HTMLButtonElement;
      fireEvent.click(bulkCheckbox);

      await waitFor(() => {
        // bulkUpdateSwitches is called with (type, targets[], checked)
        // targets is an array of {key, title} objects for ELIGIBLE books only (new or dropped)
        // From our mock data: "New Book" (isNew) and "Dropped Book" (wasDropped)
        expect(mockBulkUpdateSwitchesLocal).toHaveBeenCalledWith(
          'pos',
          expect.arrayContaining([
            expect.objectContaining({ key: '9781234567890', title: 'New Book' }),
            expect.objectContaining({ key: '9781234567893', title: 'Dropped Book' }),
          ]),
          true
        );
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render category name and book count', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('Fiction')).toBeInTheDocument();
      // Should count non-dropped books (3 out of 4)
      expect(screen.getByText('3 books')).toBeInTheDocument();
    });

    it('should render all books in the category', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('New Book')).toBeInTheDocument();
      expect(screen.getByText('Existing Book')).toBeInTheDocument();
      expect(screen.getByText('A Book Starting With Article')).toBeInTheDocument();
      expect(screen.getByText('Dropped Book')).toBeInTheDocument();
    });

    it('should display book authors', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('Author One')).toBeInTheDocument();
      expect(screen.getByText('Author Two')).toBeInTheDocument();
    });

    it('should display ISBNs', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('9781234567890')).toBeInTheDocument();
      expect(screen.getByText('9781234567891')).toBeInTheDocument();
    });

    it('should render ranks for non-dropped books', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('should not render rank for dropped books', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Find the row for Dropped Book and check it doesn't have #0
      const droppedRow = screen.getByText('Dropped Book').closest('tr');
      expect(droppedRow).not.toHaveTextContent('#0');
    });
  });

  describe('status indicators', () => {
    it('should show NEW indicator for new books', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('NEW')).toBeInTheDocument();
    });

    it('should show DROP indicator for dropped books', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      expect(screen.getByText('DROP')).toBeInTheDocument();
    });

    it('should show position change for books that moved up', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Book moved from rank 3 to rank 2 (+1)
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('should apply correct styling to new books', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const newBookRow = screen.getByText('New Book').closest('tr');
      expect(newBookRow).toHaveClass('bg-[hsl(var(--success-bg))]');
    });

    it('should apply correct styling to dropped books', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const droppedBookRow = screen.getByText('Dropped Book').closest('tr');
      expect(droppedBookRow).toHaveClass('bg-[hsl(var(--danger-bg))]');
    });
  });

  describe('sorting', () => {
    it('should render books in default order initially', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const bookTitles = screen.getAllByRole('row')
        .slice(1) // Skip header row
        .map(row => row.textContent)
        .filter(text => text?.includes('Author')); // Filter to book rows

      expect(bookTitles[0]).toContain('New Book');
      expect(bookTitles[1]).toContain('Existing Book');
      expect(bookTitles[2]).toContain('A Book Starting With Article');
    });

    it('should sort by title when sort button is clicked', async () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Find and click the sort button (looks for ArrowUpDown icon)
      const buttons = screen.getAllByRole('button');
      const sortButton = buttons.find(btn =>
        btn.querySelector('.lucide-arrow-up-down')
      );

      expect(sortButton).toBeTruthy();
      fireEvent.click(sortButton!);

      await waitFor(() => {
        const bookTitles = screen.getAllByRole('row')
          .slice(1)
          .map(row => row.textContent)
          .filter(text => text?.includes('Author'));

        // "A Book Starting With Article" should be first (article removed for sorting)
        // Then "Dropped Book", "Existing Book", "New Book"
        expect(bookTitles[0]).toContain('Book Starting With Article');
      });
    });

    it('should toggle back to default sort when clicked again', async () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const buttons = screen.getAllByRole('button');
      const sortButton = buttons.find(btn =>
        btn.querySelector('.lucide-arrow-up-down')
      );
      expect(sortButton).toBeTruthy();

      // Click to sort by title
      fireEvent.click(sortButton!);
      await waitFor(() => {
        expect(screen.getAllByRole('row')[1].textContent).toContain('Book Starting With Article');
      });

      // Click again to return to default
      fireEvent.click(sortButton!);
      await waitFor(() => {
        expect(screen.getAllByRole('row')[1].textContent).toContain('New Book');
      });
    });

    it('should remove articles (A, An, The) when sorting by title', async () => {
      const categoryWithArticles: BestsellerCategory = {
        name: 'Test',
        books: [
          {
            rank: 1,
            title: 'The Zebra Book',
            author: 'Author',
            publisher: 'Pub',
            isbn: '9781111111111',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
          {
            rank: 2,
            title: 'An Apple Book',
            author: 'Author',
            publisher: 'Pub',
            isbn: '9782222222222',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
          {
            rank: 3,
            title: 'A Banana Book',
            author: 'Author',
            publisher: 'Pub',
            isbn: '9783333333333',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
        ],
      };

      renderWithRouter(<BestsellerTable category={categoryWithArticles} />);

      const buttons = screen.getAllByRole('button');
      const sortButton = buttons.find(btn =>
        btn.querySelector('.lucide-arrow-up-down')
      );
      expect(sortButton).toBeTruthy();
      fireEvent.click(sortButton!);

      await waitFor(() => {
        const bookTitles = screen.getAllByRole('row')
          .slice(1)
          .map(row => row.textContent);

        // Should be sorted as: Apple, Banana, Zebra (ignoring articles)
        expect(bookTitles[0]).toContain('An Apple Book');
        expect(bookTitles[1]).toContain('A Banana Book');
        expect(bookTitles[2]).toContain('The Zebra Book');
      });
    });
  });

  describe('collapsible behavior', () => {
    it('should be open by default', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Books should be visible
      expect(screen.getByText('New Book')).toBeInTheDocument();
    });

    it('should collapse when header is clicked', async () => {
      const { container } = renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Click the collapsible trigger
      const trigger = screen.getByText('Fiction');
      fireEvent.click(trigger);

      await waitFor(() => {
        // Check that there's a div with both data-state="closed" and hidden attribute
        const hiddenDiv = container.querySelector('[data-state="closed"][hidden]');
        expect(hiddenDiv).toBeTruthy();
      });
    });

    it('should expand when clicked again', async () => {
      const { container } = renderWithRouter(<BestsellerTable category={mockCategory} />);

      const trigger = screen.getByText('Fiction');

      // Collapse
      fireEvent.click(trigger);
      await waitFor(() => {
        const hiddenDiv = container.querySelector('[data-state="closed"][hidden]');
        expect(hiddenDiv).toBeTruthy();
      });

      // Expand
      fireEvent.click(trigger);
      await waitFor(() => {
        const openDiv = container.querySelector('[data-state="open"]');
        expect(openDiv).toBeTruthy();
        // When open, the div should not have the hidden attribute
        expect(openDiv).not.toHaveAttribute('hidden');
      });
    });
  });

  describe('ISBN copying', () => {
    it('should copy ISBN to clipboard when copy button is clicked', async () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      // Find the first copy button (for New Book's ISBN)
      const copyButtons = screen.getAllByRole('button');
      const copyButton = copyButtons.find(btn =>
        btn.querySelector('svg')?.classList.contains('lucide-copy')
      );

      expect(copyButton).toBeTruthy();

      if (copyButton) {
        fireEvent.click(copyButton);

        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith('9781234567890');
        });
      }
    });
  });

  describe('audience filtering mode', () => {
    it('should group books by status when isAudienceFiltered is true', () => {
      renderWithRouter(
        <BestsellerTable category={mockCategory} isAudienceFiltered={true} />
      );

      const bookTitles = screen.getAllByRole('row')
        .slice(1)
        .map(row => row.textContent);

      // Should be: adds first, then remaining, then drops
      expect(bookTitles[0]).toContain('New Book'); // add
      expect(bookTitles[1]).toContain('Existing Book'); // remaining
      expect(bookTitles[2]).toContain('A Book Starting With Article'); // remaining
      expect(bookTitles[3]).toContain('Dropped Book'); // drop
    });

    it('should not show rank column when audience filtered', () => {
      renderWithRouter(
        <BestsellerTable category={mockCategory} isAudienceFiltered={true} />
      );

      // Should not have "Rank" header
      expect(screen.queryByText('Rank')).not.toBeInTheDocument();

      // Should have "List" header instead
      expect(screen.getByText('List')).toBeInTheDocument();
    });
  });

  describe('weeks on list', () => {
    it('should display weeks on list when available', () => {
      const categoryWithWeeks: BestsellerCategory = {
        name: 'Test',
        books: [
          {
            rank: 1,
            title: 'Book One',
            author: 'Author',
            publisher: 'Pub',
            isbn: '9781111111111',
            price: '$25',
            isNew: false,
            wasDropped: false,
            weeksOnList: 5,
          },
        ],
      };

      renderWithRouter(<BestsellerTable category={categoryWithWeeks} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show 1 week when weeksOnList is not provided', () => {
      const categoryNoWeeks: BestsellerCategory = {
        name: 'Test',
        books: [
          {
            rank: 1,
            title: 'Book One',
            author: 'Author',
            publisher: 'Pub',
            isbn: '9781111111111',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
        ],
      };

      renderWithRouter(<BestsellerTable category={categoryNoWeeks} />);

      // Should default to 1
      const weeksCell = screen.getByText('Book One').closest('tr')?.querySelector('td:nth-child(4)');
      expect(weeksCell?.textContent).toBe('1');
    });
  });

  describe('edge cases', () => {
    it('should handle empty category', () => {
      const emptyCategory: BestsellerCategory = {
        name: 'Empty Category',
        books: [],
      };

      renderWithRouter(<BestsellerTable category={emptyCategory} />);

      expect(screen.getByText('Empty Category')).toBeInTheDocument();
      expect(screen.getByText('0 books')).toBeInTheDocument();
    });

    it('should handle books without ISBN', () => {
      const categoryNoISBN: BestsellerCategory = {
        name: 'Test',
        books: [
          {
            rank: 1,
            title: 'Book Without ISBN',
            author: 'Author',
            publisher: 'Pub',
            isbn: '',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
        ],
      };

      renderWithRouter(<BestsellerTable category={categoryNoISBN} />);

      // Should render without ISBN link
      const bookTitle = screen.getByText('Book Without ISBN');
      expect(bookTitle.tagName).toBe('SPAN'); // Not a Link
    });

    it('should handle books with no previous rank', () => {
      const categoryNoPrevRank: BestsellerCategory = {
        name: 'Test',
        books: [
          {
            rank: 1,
            title: 'Book',
            author: 'Author',
            publisher: 'Pub',
            isbn: '9781111111111',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
        ],
      };

      renderWithRouter(<BestsellerTable category={categoryNoPrevRank} />);

      // Should show "—" for no change
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('should create links to book detail pages when ISBN exists', () => {
      renderWithRouter(<BestsellerTable category={mockCategory} />);

      const newBookLink = screen.getByText('New Book').closest('a');
      expect(newBookLink).toHaveAttribute('href', '/book/9781234567890');
    });

    it('should not create links when ISBN is missing', () => {
      const categoryNoISBN: BestsellerCategory = {
        name: 'Test',
        books: [
          {
            rank: 1,
            title: 'Book Without ISBN',
            author: 'Author',
            publisher: 'Pub',
            isbn: '',
            price: '$25',
            isNew: false,
            wasDropped: false,
          },
        ],
      };

      renderWithRouter(<BestsellerTable category={categoryNoISBN} />);

      const bookTitle = screen.getByText('Book Without ISBN');
      expect(bookTitle.closest('a')).toBeNull();
    });
  });
});
