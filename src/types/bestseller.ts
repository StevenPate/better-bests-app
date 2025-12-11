export interface BestsellerBook {
  rank: number;
  title: string;
  author: string;
  publisher: string;
  price: string;
  isbn: string;
  previousRank?: number;
  isNew?: boolean;
  wasDropped?: boolean;
  weeksOnList?: number;
}

export interface BestsellerCategory {
  name: string;
  books: BestsellerBook[];
}

export interface BestsellerList {
  title: string;
  date: string;
  categories: BestsellerCategory[];
}