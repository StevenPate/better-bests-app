export interface Book {
  rank: number;
  title: string;
  author: string;
  publisher: string;
  price: string;
  isbn: string;
  isNew?: boolean;
  previousRank?: number;
  rankChange?: number;
}

export interface BookCategory {
  name: string;
  books: Book[];
}

export interface ParsedBookData {
  title: string;
  date?: string;
  categories: BookCategory[];
}