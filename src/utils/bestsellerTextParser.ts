import { BestsellerList, BestsellerCategory, BestsellerBook } from '@/types/bestseller';

export function parseList(content: string): BestsellerList {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  let title = '';
  let date = '';
  const categories: BestsellerCategory[] = [];
  let currentCategory: BestsellerCategory | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract title and date from header
    if (i < 5 && line.toLowerCase().includes('bestsellers')) {
      title = line;
    }

    if (i < 5 && line.includes('week ended')) {
      const dateMatch = line.match(/week ended (\w+, \w+ \d+, \d+)/);
      if (dateMatch) {
        date = dateMatch[1];
      }
    }

    // Check if this line is a category header
    if (isCategoryHeader(line)) {
      if (currentCategory) {
        categories.push(currentCategory);
      }
      currentCategory = {
        name: formatCategoryName(line),
        books: []
      };
      continue;
    }

    // Check if this line is a book entry
    if (currentCategory && isBookEntry(line)) {
      const result = parseBookEntryWithLookahead(line, lines, i);
      if (result.book) {
        currentCategory.books.push(result.book);
        // Skip the lines we've already processed
        i = result.nextIndex - 1; // -1 because the for loop will increment
      }
    }
  }

  if (currentCategory) {
    categories.push(currentCategory);
  }

  return {
    title: title || 'Better Bestsellers',
    date,
    categories
  };
}

export function isCategoryHeader(line: string): boolean {
  return line === line.toUpperCase() &&
         line.length > 3 &&
         !line.match(/^\d/) &&
         !line.includes('$') &&
         !line.includes('978') &&
         line.includes(' ');
}

export function isBookEntry(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

export function parseBookEntryWithLookahead(titleLine: string, lines: string[], startIndex: number): { book: BestsellerBook | null; nextIndex: number } {
  const titleMatch = titleLine.match(/^(\d+)\.\s(.+)$/);
  if (!titleMatch) {
    return { book: null, nextIndex: startIndex + 1 };
  }

  const rank = parseInt(titleMatch[1]);
  let title = titleMatch[2];

  // Look ahead to find the detail line (contains ISBN, price, or author info)
  let detailLineIndex = startIndex + 1;
  let detailLine = '';

  while (detailLineIndex < lines.length) {
    const candidateLine = lines[detailLineIndex];

    // Stop if we hit another book entry
    if (isBookEntry(candidateLine)) {
      break;
    }

    // Stop if we hit a category header
    if (isCategoryHeader(candidateLine)) {
      break;
    }

    // Check if this line looks like a detail line (has ISBN, price, or typical author/publisher structure)
    if (isDetailLine(candidateLine)) {
      detailLine = candidateLine;
      break;
    }

    // This line is likely a continuation of the title
    title += ' ' + candidateLine;
    detailLineIndex++;
  }

  if (!detailLine) {
    return { book: null, nextIndex: detailLineIndex };
  }

  const isbnMatch = detailLine.match(/978\d{10}|979\d{10}/);
  const isbn = isbnMatch ? isbnMatch[0] : '';

  const priceMatch = detailLine.match(/\$[\d,]+\.?\d*/);
  const price = priceMatch ? priceMatch[0] : '';

  let authorPublisher = detailLine;
  if (isbn) authorPublisher = authorPublisher.replace(isbn, '');
  if (price) authorPublisher = authorPublisher.replace(price, '');

  authorPublisher = authorPublisher.replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim();
  const parts = authorPublisher.split(',').map(part => part.trim()).filter(part => part.length > 0);

  const author = parts[0] || 'Unknown Author';
  const publisher = parts[1] || 'Unknown Publisher';

  return {
    book: {
      rank,
      title: title.trim(),
      author,
      publisher,
      price,
      isbn
    },
    nextIndex: detailLineIndex + 1
  };
}

export function isDetailLine(line: string): boolean {
  const hasIsbn = /978\d{10}|979\d{10}/.test(line);
  const hasPrice = /\$[\d,]+\.?\d*/.test(line);
  const hasMultipleCommas = (line.match(/,/g) || []).length >= 1;

  if (hasIsbn || hasPrice) {
    return true;
  }

  if (hasMultipleCommas && line.length > 10) {
    return true;
  }

  return false;
}

export function formatCategoryName(categoryLine: string): string {
  return categoryLine
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
