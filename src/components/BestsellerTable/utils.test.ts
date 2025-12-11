import { describe, it, expect } from 'vitest';
import { Star, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  getBookKey,
  isEligibleForSwitching,
  getRankChangeType,
  getRankChangeIcon,
  getRankChangeText,
  getRowClassName,
  sortBooks,
  cleanTitleForSorting
} from './utils';
import { BestsellerTableBook } from './types';

describe('BestsellerTable utils', () => {
  describe('getBookKey', () => {
    it('should generate key using ISBN when available', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        price: '$20.00',
        isbn: '1234567890'
      };
      expect(getBookKey(book, 0)).toBe('1234567890-0');
    });

    it('should use title when ISBN is missing', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test Book',
        author: 'Test Author',
        publisher: 'Test Publisher',
        price: '$20.00',
        isbn: ''
      };
      expect(getBookKey(book, 5)).toBe('Test Book-5');
    });
  });

  describe('isEligibleForSwitching', () => {
    it('should return true for new books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        isNew: true
      };
      expect(isEligibleForSwitching(book)).toBe(true);
    });

    it('should return true for dropped books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        wasDropped: true
      };
      expect(isEligibleForSwitching(book)).toBe(true);
    });

    it('should return false for existing books without changes', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123'
      };
      expect(isEligibleForSwitching(book)).toBe(false);
    });
  });

  describe('getRankChangeType', () => {
    it('should return "new" for new books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        isNew: true
      };
      expect(getRankChangeType(book)).toBe('new');
    });

    it('should return "dropped" for dropped books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        wasDropped: true
      };
      expect(getRankChangeType(book)).toBe('dropped');
    });

    it('should return "up" when rank improved', () => {
      const book: BestsellerTableBook = {
        rank: 3,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        previousRank: 5
      };
      expect(getRankChangeType(book)).toBe('up');
    });

    it('should return "down" when rank worsened', () => {
      const book: BestsellerTableBook = {
        rank: 5,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        previousRank: 3
      };
      expect(getRankChangeType(book)).toBe('down');
    });

    it('should return "unchanged" when no change', () => {
      const book: BestsellerTableBook = {
        rank: 3,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        previousRank: 3
      };
      expect(getRankChangeType(book)).toBe('unchanged');
    });
  });

  describe('getRankChangeIcon', () => {
    it('should return Star for new books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        isNew: true
      };
      expect(getRankChangeIcon(book)).toBe(Star);
    });

    it('should return TrendingDown for dropped books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        wasDropped: true
      };
      expect(getRankChangeIcon(book)).toBe(TrendingDown);
    });

    it('should return TrendingUp for rank improvements', () => {
      const book: BestsellerTableBook = {
        rank: 3,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        previousRank: 5
      };
      expect(getRankChangeIcon(book)).toBe(TrendingUp);
    });

    it('should return Minus for unchanged', () => {
      const book: BestsellerTableBook = {
        rank: 3,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123'
      };
      expect(getRankChangeIcon(book)).toBe(Minus);
    });
  });

  describe('getRankChangeText', () => {
    it('should return "NEW" for new books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        isNew: true
      };
      expect(getRankChangeText(book)).toBe('NEW');
    });

    it('should return "DROP" for dropped books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        wasDropped: true
      };
      expect(getRankChangeText(book)).toBe('DROP');
    });

    it('should return positive change for rank improvements', () => {
      const book: BestsellerTableBook = {
        rank: 3,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        previousRank: 5
      };
      expect(getRankChangeText(book)).toBe('+2');
    });

    it('should return negative change for rank decline', () => {
      const book: BestsellerTableBook = {
        rank: 5,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        previousRank: 3
      };
      expect(getRankChangeText(book)).toBe('-2');
    });
  });

  describe('getRowClassName', () => {
    it('should return success classes for new books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        isNew: true
      };
      expect(getRowClassName(book)).toContain('success-bg');
    });

    it('should return danger classes for dropped books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123',
        wasDropped: true
      };
      expect(getRowClassName(book)).toContain('danger-bg');
    });

    it('should return default hover for normal books', () => {
      const book: BestsellerTableBook = {
        rank: 1,
        title: 'Test',
        author: 'Author',
        publisher: 'Pub',
        price: '$10',
        isbn: '123'
      };
      expect(getRowClassName(book)).toBe('hover:bg-muted/50');
    });
  });

  describe('sortBooks', () => {
    const createBook = (title: string, rank: number, isNew = false, wasDropped = false): BestsellerTableBook => ({
      rank,
      title,
      author: 'Author',
      publisher: 'Pub',
      price: '$10',
      isbn: `${rank}`,
      isNew,
      wasDropped
    });

    it('should maintain default order when not sorted', () => {
      const books = [
        createBook('Book C', 1),
        createBook('Book A', 2),
        createBook('Book B', 3)
      ];
      const sorted = sortBooks(books, 'default', false);
      expect(sorted[0].title).toBe('Book C');
      expect(sorted[1].title).toBe('Book A');
      expect(sorted[2].title).toBe('Book B');
    });

    it('should sort alphabetically by title', () => {
      const books = [
        createBook('Book C', 1),
        createBook('Book A', 2),
        createBook('Book B', 3)
      ];
      const sorted = sortBooks(books, 'title', false);
      expect(sorted[0].title).toBe('Book A');
      expect(sorted[1].title).toBe('Book B');
      expect(sorted[2].title).toBe('Book C');
    });

    it('should remove articles when sorting by title', () => {
      const books = [
        createBook('The Zebra', 1),
        createBook('A Cat', 2),
        createBook('An Apple', 3)
      ];
      const sorted = sortBooks(books, 'title', false);
      expect(sorted[0].title).toBe('An Apple');
      expect(sorted[1].title).toBe('A Cat');
      expect(sorted[2].title).toBe('The Zebra');
    });

    it('should group by status when audience filtered', () => {
      const books = [
        createBook('Normal Book', 1),
        createBook('New Book', 2, true),
        createBook('Dropped Book', 3, false, true)
      ];
      const sorted = sortBooks(books, 'default', true);
      expect(sorted[0].title).toBe('New Book');
      expect(sorted[1].title).toBe('Normal Book');
      expect(sorted[2].title).toBe('Dropped Book');
    });
  });

  describe('cleanTitleForSorting', () => {
    it('should remove "The" from beginning', () => {
      expect(cleanTitleForSorting('The Great Gatsby')).toBe('Great Gatsby');
    });

    it('should remove "A" from beginning', () => {
      expect(cleanTitleForSorting('A Tale of Two Cities')).toBe('Tale of Two Cities');
    });

    it('should remove "An" from beginning', () => {
      expect(cleanTitleForSorting('An American Tragedy')).toBe('American Tragedy');
    });

    it('should be case insensitive', () => {
      expect(cleanTitleForSorting('the great gatsby')).toBe('great gatsby');
    });

    it('should not remove articles from middle of title', () => {
      expect(cleanTitleForSorting('Gone with the Wind')).toBe('Gone with the Wind');
    });
  });
});
