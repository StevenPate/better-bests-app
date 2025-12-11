import { Book, BookCategory, ParsedBookData } from '@/types/book';
import { logger } from '@/lib/logger';

export class BookParser {
  static parseTextFile(content: string): ParsedBookData {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let title = '';
    let date = '';
    const categories: BookCategory[] = [];
    let currentCategory: BookCategory | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Extract title and date from the first few lines
      if (i < 5 && line.includes('Bestsellers') && !title) {
        title = line;
      }
      
      if (i < 5 && line.includes('week ended')) {
        const dateMatch = line.match(/week ended (\w+, \w+ \d+, \d+)/);
        if (dateMatch) {
          date = dateMatch[1];
        }
      }
      
      // Check if this line is a category header (all caps, no numbers)
      if (this.isCategoryHeader(line)) {
        if (currentCategory) {
          categories.push(currentCategory);
        }
        currentCategory = {
          name: this.formatCategoryName(line),
          books: []
        };
        continue;
      }
      
      // Check if this line is a book entry (starts with number)
      if (currentCategory && this.isBookEntry(line)) {
        const book = this.parseBookEntry(line, lines[i + 1] || '');
        if (book) {
          currentCategory.books.push(book);
        }
      }
    }
    
    // Add the last category
    if (currentCategory) {
      categories.push(currentCategory);
    }
    
    return {
      title: title || 'Bestsellers List',
      date,
      categories
    };
  }
  
  private static isCategoryHeader(line: string): boolean {
    // Category headers are typically all caps and don't start with numbers
    return line === line.toUpperCase() && 
           line.length > 3 && 
           !line.match(/^\d/) &&
           !line.includes('$') &&
           !line.includes('9780') && // ISBN indicator
           line.includes(' '); // Has spaces (not just one word)
  }
  
  private static isBookEntry(line: string): boolean {
    // Book entries start with a number followed by a period
    return /^\d+\.\s/.test(line);
  }
  
  private static parseBookEntry(titleLine: string, detailLine: string): Book | null {
    // Extract rank and title
    const titleMatch = titleLine.match(/^(\d+)\.\s(.+)$/);
    if (!titleMatch) return null;
    
    const rank = parseInt(titleMatch[1]);
    const title = titleMatch[2];
    
    // Parse the detail line (author, publisher, price, ISBN)
    if (!detailLine || detailLine.match(/^\d+\./)) {
      // Detail line is missing or is another book entry
      return null;
    }
    
    // Try to extract ISBN (13-digit number starting with 978 or 979)
    const isbnMatch = detailLine.match(/978\d{10}|979\d{10}/);
    const isbn = isbnMatch ? isbnMatch[0] : '';
    
    // Try to extract price ($XX.XX format)
    const priceMatch = detailLine.match(/\$[\d,]+\.?\d*/);
    const price = priceMatch ? priceMatch[0] : '';
    
    // Remove ISBN and price from detail line to get author and publisher
    let authorPublisher = detailLine;
    if (isbn) {
      authorPublisher = authorPublisher.replace(isbn, '');
    }
    if (price) {
      authorPublisher = authorPublisher.replace(price, '');
    }
    
    // Clean up and split author and publisher
    authorPublisher = authorPublisher.replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim();
    const parts = authorPublisher.split(',').map(part => part.trim()).filter(part => part.length > 0);
    
    const author = parts[0] || 'Unknown Author';
    const publisher = parts[1] || 'Unknown Publisher';
    
    return {
      rank,
      title,
      author,
      publisher,
      price,
      isbn
    };
  }
  
  private static formatCategoryName(categoryLine: string): string {
    return categoryLine
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  static compareWithPreviousWeek(currentData: ParsedBookData, previousData: ParsedBookData): ParsedBookData {
    logger.debug('Comparing weeks:', { 
      current: currentData.categories.length, 
      previous: previousData.categories.length 
    });

    const updatedCategories = currentData.categories.map(currentCategory => {
      const previousCategory = previousData.categories.find(cat => cat.name === currentCategory.name);
      logger.debug(`Processing category: ${currentCategory.name}, found previous: ${!!previousCategory}`);
      
      const updatedBooks = currentCategory.books.map(currentBook => {
        const previousBook = previousCategory?.books.find(book => 
          book.title === currentBook.title && book.author === currentBook.author
        );
        
        if (!previousBook) {
          logger.debug(`New book found: ${currentBook.title}`);
          return {
            ...currentBook,
            isNew: true,
            rankChange: 0
          };
        }
        
        const rankChange = previousBook.rank - currentBook.rank;
        logger.debug(`Book ${currentBook.title}: rank ${currentBook.rank} (was ${previousBook.rank}, change: ${rankChange})`);
        
        return {
          ...currentBook,
          isNew: false,
          previousRank: previousBook.rank,
          rankChange
        };
      });
      
      return {
        ...currentCategory,
        books: updatedBooks
      };
    });
    
    return {
      ...currentData,
      categories: updatedCategories
    };
  }
}