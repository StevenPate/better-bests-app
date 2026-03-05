export interface RegionalBook {
  region: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  rank: number;
  category: string | null;
  week_date: string;
  list_title: string | null;
  price: string | null;
}
