// src/utils/bookFilters.test.ts
import { describe, it, expect } from 'vitest';
import {
  matchesAddDropFilter,
  matchesAudienceFilter,
  matchesSearchTerm,
  matchesAllFilters,
} from './bookFilters';
import type { BestsellerBook } from '@/types/bestseller';

describe('matchesAddDropFilter', () => {
  const newBook: BestsellerBook = {
    rank: 1,
    title: 'New Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$20',
    isbn: '123',
    isNew: true,
    wasDropped: false,
  };

  const droppedBook: BestsellerBook = {
    rank: 1,
    title: 'Dropped Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$20',
    isbn: '456',
    isNew: false,
    wasDropped: true,
  };

  const unchangedBook: BestsellerBook = {
    rank: 1,
    title: 'Unchanged Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$20',
    isbn: '789',
    isNew: false,
    wasDropped: false,
  };

  const newAndDroppedBook: BestsellerBook = {
    rank: 1,
    title: 'Edge Case Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$20',
    isbn: '000',
    isNew: true,
    wasDropped: true,
  };

  describe('filter: adds', () => {
    it('should return true for new books', () => {
      expect(matchesAddDropFilter(newBook, 'adds')).toBe(true);
    });

    it('should return false for non-new books', () => {
      expect(matchesAddDropFilter(unchangedBook, 'adds')).toBe(false);
      expect(matchesAddDropFilter(droppedBook, 'adds')).toBe(false);
    });

    it('should return true for books that are both new and dropped', () => {
      expect(matchesAddDropFilter(newAndDroppedBook, 'adds')).toBe(true);
    });
  });

  describe('filter: drops', () => {
    it('should return true for dropped books', () => {
      expect(matchesAddDropFilter(droppedBook, 'drops')).toBe(true);
    });

    it('should return false for non-dropped books', () => {
      expect(matchesAddDropFilter(unchangedBook, 'drops')).toBe(false);
      expect(matchesAddDropFilter(newBook, 'drops')).toBe(false);
    });

    it('should return true for books that are both new and dropped', () => {
      expect(matchesAddDropFilter(newAndDroppedBook, 'drops')).toBe(true);
    });
  });

  describe('filter: adds-drops', () => {
    it('should return true for new books', () => {
      expect(matchesAddDropFilter(newBook, 'adds-drops')).toBe(true);
    });

    it('should return true for dropped books', () => {
      expect(matchesAddDropFilter(droppedBook, 'adds-drops')).toBe(true);
    });

    it('should return false for unchanged books', () => {
      expect(matchesAddDropFilter(unchangedBook, 'adds-drops')).toBe(false);
    });

    it('should return true for books that are both new and dropped', () => {
      expect(matchesAddDropFilter(newAndDroppedBook, 'adds-drops')).toBe(true);
    });
  });

  describe('filter: no-drops', () => {
    it('should return true for new books', () => {
      expect(matchesAddDropFilter(newBook, 'no-drops')).toBe(true);
    });

    it('should return true for unchanged books', () => {
      expect(matchesAddDropFilter(unchangedBook, 'no-drops')).toBe(true);
    });

    it('should return false for dropped books', () => {
      expect(matchesAddDropFilter(droppedBook, 'no-drops')).toBe(false);
    });

    it('should return false for books that are both new and dropped', () => {
      expect(matchesAddDropFilter(newAndDroppedBook, 'no-drops')).toBe(false);
    });
  });

  describe('filter: all', () => {
    it('should return true for all books', () => {
      expect(matchesAddDropFilter(newBook, 'all')).toBe(true);
      expect(matchesAddDropFilter(droppedBook, 'all')).toBe(true);
      expect(matchesAddDropFilter(unchangedBook, 'all')).toBe(true);
      expect(matchesAddDropFilter(newAndDroppedBook, 'all')).toBe(true);
    });
  });

  describe('filter: null or undefined', () => {
    it('should return true when filter is null', () => {
      expect(matchesAddDropFilter(newBook, null)).toBe(true);
      expect(matchesAddDropFilter(droppedBook, null)).toBe(true);
      expect(matchesAddDropFilter(unchangedBook, null)).toBe(true);
    });
  });

  describe('filter: unknown', () => {
    it('should return true for unknown filter types (fallback)', () => {
      expect(matchesAddDropFilter(newBook, 'unknown-filter')).toBe(true);
      expect(matchesAddDropFilter(droppedBook, 'invalid')).toBe(true);
    });
  });
});

describe('matchesAudienceFilter', () => {
  const adultBook: BestsellerBook = {
    rank: 1,
    title: 'Adult Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$20',
    isbn: '9781234567890',
  };

  const teenBook: BestsellerBook = {
    rank: 1,
    title: 'Teen Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$15',
    isbn: '9780987654321',
  };

  const childrenBook: BestsellerBook = {
    rank: 1,
    title: 'Children Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$10',
    isbn: '9785555555555',
  };

  const bookWithoutIsbn: BestsellerBook = {
    rank: 1,
    title: 'No ISBN Book',
    author: 'Author',
    publisher: 'Publisher',
    price: '$20',
    isbn: '',
  };

  const audiences: Record<string, string> = {
    '9781234567890': 'A',
    '9780987654321': 'T',
    '9785555555555': 'C',
  };

  describe('audience: A (Adult)', () => {
    it('should return true for adult books', () => {
      expect(matchesAudienceFilter(adultBook, audiences, 'A')).toBe(true);
    });

    it('should return false for non-adult books', () => {
      expect(matchesAudienceFilter(teenBook, audiences, 'A')).toBe(false);
      expect(matchesAudienceFilter(childrenBook, audiences, 'A')).toBe(false);
    });
  });

  describe('audience: T (Teen)', () => {
    it('should return true for teen books', () => {
      expect(matchesAudienceFilter(teenBook, audiences, 'T')).toBe(true);
    });

    it('should return false for non-teen books', () => {
      expect(matchesAudienceFilter(adultBook, audiences, 'T')).toBe(false);
      expect(matchesAudienceFilter(childrenBook, audiences, 'T')).toBe(false);
    });
  });

  describe('audience: C (Children)', () => {
    it('should return true for children books', () => {
      expect(matchesAudienceFilter(childrenBook, audiences, 'C')).toBe(true);
    });

    it('should return false for non-children books', () => {
      expect(matchesAudienceFilter(adultBook, audiences, 'C')).toBe(false);
      expect(matchesAudienceFilter(teenBook, audiences, 'C')).toBe(false);
    });
  });

  describe('audience: all', () => {
    it('should return true for all books', () => {
      expect(matchesAudienceFilter(adultBook, audiences, 'all')).toBe(true);
      expect(matchesAudienceFilter(teenBook, audiences, 'all')).toBe(true);
      expect(matchesAudienceFilter(childrenBook, audiences, 'all')).toBe(true);
    });
  });

  describe('audience: null or undefined', () => {
    it('should return true when filter is null', () => {
      expect(matchesAudienceFilter(adultBook, audiences, null)).toBe(true);
      expect(matchesAudienceFilter(teenBook, audiences, null)).toBe(true);
    });
  });

  describe('books without ISBN', () => {
    it('should return false when book has no ISBN', () => {
      expect(matchesAudienceFilter(bookWithoutIsbn, audiences, 'A')).toBe(false);
      expect(matchesAudienceFilter(bookWithoutIsbn, audiences, 'T')).toBe(false);
      expect(matchesAudienceFilter(bookWithoutIsbn, audiences, 'C')).toBe(false);
    });

    it('should return true when filter is "all" even without ISBN', () => {
      expect(matchesAudienceFilter(bookWithoutIsbn, audiences, 'all')).toBe(true);
    });
  });

  describe('books not in audience map', () => {
    const unknownBook: BestsellerBook = {
      rank: 1,
      title: 'Unknown Book',
      author: 'Author',
      publisher: 'Publisher',
      price: '$20',
      isbn: '9999999999999',
    };

    it('should return false when book is not in audience map', () => {
      expect(matchesAudienceFilter(unknownBook, audiences, 'A')).toBe(false);
      expect(matchesAudienceFilter(unknownBook, audiences, 'T')).toBe(false);
      expect(matchesAudienceFilter(unknownBook, audiences, 'C')).toBe(false);
    });
  });
});

describe('matchesSearchTerm', () => {
  const book: BestsellerBook = {
    rank: 1,
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    publisher: 'Scribner',
    price: '$15.99',
    isbn: '9780743273565',
  };

  describe('title search', () => {
    it('should match by title (case-insensitive)', () => {
      expect(matchesSearchTerm(book, 'gatsby')).toBe(true);
      expect(matchesSearchTerm(book, 'GATSBY')).toBe(true);
      expect(matchesSearchTerm(book, 'great')).toBe(true);
      expect(matchesSearchTerm(book, 'The Great')).toBe(true);
    });

    it('should not match non-existent title words', () => {
      expect(matchesSearchTerm(book, 'hemingway')).toBe(false);
      expect(matchesSearchTerm(book, 'invisible')).toBe(false);
    });
  });

  describe('author search', () => {
    it('should match by author (case-insensitive)', () => {
      expect(matchesSearchTerm(book, 'fitzgerald')).toBe(true);
      expect(matchesSearchTerm(book, 'FITZGERALD')).toBe(true);
      expect(matchesSearchTerm(book, 'scott')).toBe(true);
      expect(matchesSearchTerm(book, 'F. Scott')).toBe(true);
    });

    it('should not match non-existent author names', () => {
      expect(matchesSearchTerm(book, 'hemingway')).toBe(false);
      expect(matchesSearchTerm(book, 'tolkien')).toBe(false);
    });
  });

  describe('ISBN search', () => {
    it('should match by ISBN (partial)', () => {
      expect(matchesSearchTerm(book, '9780743273565')).toBe(true);
      expect(matchesSearchTerm(book, '978074327')).toBe(true);
      expect(matchesSearchTerm(book, '3565')).toBe(true);
    });

    it('should not match non-existent ISBNs', () => {
      expect(matchesSearchTerm(book, '9999999')).toBe(false);
    });
  });

  describe('empty or whitespace search', () => {
    it('should return true for empty string', () => {
      expect(matchesSearchTerm(book, '')).toBe(true);
    });

    it('should return true for whitespace-only strings', () => {
      expect(matchesSearchTerm(book, '   ')).toBe(true);
      expect(matchesSearchTerm(book, '\t')).toBe(true);
      expect(matchesSearchTerm(book, '\n')).toBe(true);
    });
  });

  describe('partial matches', () => {
    it('should match partial words', () => {
      expect(matchesSearchTerm(book, 'gat')).toBe(true);
      expect(matchesSearchTerm(book, 'fitz')).toBe(true);
      expect(matchesSearchTerm(book, 'rea')).toBe(true);
    });
  });

  describe('special characters', () => {
    it('should match with special characters in search', () => {
      expect(matchesSearchTerm(book, 'F.')).toBe(true);
      expect(matchesSearchTerm(book, 'F. Scott')).toBe(true);
    });
  });
});

describe('matchesAllFilters', () => {
  const audiences: Record<string, string> = {
    '123': 'A',
    '456': 'T',
    '789': 'C',
  };

  const adultNewBook: BestsellerBook = {
    rank: 1,
    title: 'Sample Adult Book',
    author: 'John Doe',
    publisher: 'Publisher',
    price: '$20',
    isbn: '123',
    isNew: true,
    wasDropped: false,
  };

  const teenDroppedBook: BestsellerBook = {
    rank: 2,
    title: 'Teen Mystery',
    author: 'Jane Smith',
    publisher: 'Publisher',
    price: '$15',
    isbn: '456',
    isNew: false,
    wasDropped: true,
  };

  const childrenBook: BestsellerBook = {
    rank: 3,
    title: 'Kids Adventure',
    author: 'Bob Jones',
    publisher: 'Publisher',
    price: '$10',
    isbn: '789',
    isNew: false,
    wasDropped: false,
  };

  describe('all filters active', () => {
    it('should pass when book matches all filters', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'A',
          searchTerm: 'sample',
        })
      ).toBe(true);
    });

    it('should fail when book does not match add/drop filter', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'drops',
          audiences,
          audienceFilter: 'A',
          searchTerm: 'sample',
        })
      ).toBe(false);
    });

    it('should fail when book does not match audience filter', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'T',
          searchTerm: 'sample',
        })
      ).toBe(false);
    });

    it('should fail when book does not match search term', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'A',
          searchTerm: 'nonexistent',
        })
      ).toBe(false);
    });
  });

  describe('no filters active', () => {
    it('should pass all books when no filters are active', () => {
      const noFilters = {
        filter: 'all',
        audiences,
        audienceFilter: 'all',
        searchTerm: '',
      };

      expect(matchesAllFilters(adultNewBook, noFilters)).toBe(true);
      expect(matchesAllFilters(teenDroppedBook, noFilters)).toBe(true);
      expect(matchesAllFilters(childrenBook, noFilters)).toBe(true);
    });
  });

  describe('partial filters active', () => {
    it('should apply only active filters (filter only)', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'all',
          searchTerm: '',
        })
      ).toBe(true);

      expect(
        matchesAllFilters(teenDroppedBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'all',
          searchTerm: '',
        })
      ).toBe(false);
    });

    it('should apply only active filters (audience only)', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'all',
          audiences,
          audienceFilter: 'A',
          searchTerm: '',
        })
      ).toBe(true);

      expect(
        matchesAllFilters(teenDroppedBook, {
          filter: 'all',
          audiences,
          audienceFilter: 'A',
          searchTerm: '',
        })
      ).toBe(false);
    });

    it('should apply only active filters (search only)', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'all',
          audiences,
          audienceFilter: 'all',
          searchTerm: 'sample',
        })
      ).toBe(true);

      expect(
        matchesAllFilters(teenDroppedBook, {
          filter: 'all',
          audiences,
          audienceFilter: 'all',
          searchTerm: 'sample',
        })
      ).toBe(false);
    });
  });

  describe('combined filters', () => {
    it('should pass when filter + audience match', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'A',
          searchTerm: '',
        })
      ).toBe(true);
    });

    it('should pass when filter + search match', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'adds',
          audiences,
          audienceFilter: 'all',
          searchTerm: 'adult',
        })
      ).toBe(true);
    });

    it('should pass when audience + search match', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: 'all',
          audiences,
          audienceFilter: 'A',
          searchTerm: 'doe',
        })
      ).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null filter', () => {
      expect(
        matchesAllFilters(adultNewBook, {
          filter: null,
          audiences,
          audienceFilter: null,
          searchTerm: '',
        })
      ).toBe(true);
    });

    it('should fail when audience filter is set but book has no ISBN', () => {
      const bookWithoutIsbn: BestsellerBook = {
        ...adultNewBook,
        isbn: '',
      };

      expect(
        matchesAllFilters(bookWithoutIsbn, {
          filter: 'all',
          audiences,
          audienceFilter: 'A',
          searchTerm: '',
        })
      ).toBe(false);
    });
  });
});
