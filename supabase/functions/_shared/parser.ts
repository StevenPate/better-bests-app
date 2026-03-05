import { normalizeIsbn } from "./utils.ts";
import { REGIONS } from "./regions.ts";
import type { RegionalBook } from "./types.ts";

function getListTitle(regionAbbr: string): string {
  const region = REGIONS.find(r => r.abbreviation === regionAbbr);
  return region ? `${regionAbbr} Independent Bestsellers` : 'Regional Bestsellers';
}

export function parseRegionalList(content: string, region: string, weekDate: string): RegionalBook[] {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  const books: RegionalBook[] = [];

  let currentCategory = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines
    if (
      line.includes('INDEPENDENT BESTSELLERS') ||
      line.includes('Sales Week Ended') ||
      line.includes('Compiled by') ||
      line === '' ||
      line.startsWith('For more information')
    ) {
      continue;
    }

    // Check if this is a category header (all caps, no numbers)
    if (line.match(/^[A-Z\s]+$/) && line.length > 3 && !line.match(/^\d+/)) {
      currentCategory = line;
      continue;
    }

    // Check if this is a book entry (starts with rank number)
    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1]);
      const title = rankMatch[2].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      // Parse the details line (author, publisher, price, ISBN)
      if (nextLine && !nextLine.match(/^\d+\./)) {
        const details = nextLine.trim();
        const parts = details.split(',').map(part => part.trim());

        if (parts.length >= 2) {
          const author = parts[0];
          let publisher = parts.length >= 3 ? parts[1] : null;
          let isbn = '';
          let price = null;

          // Look for ISBN in the parts (normalize by removing hyphens)
          for (const part of parts) {
            const cleanPart = normalizeIsbn(part);
            if (cleanPart.match(/^\d{10}(\d{3})?$/)) {
              isbn = cleanPart;
              break;
            }
          }

          // Look for price (e.g., "$16.99", "$28.00")
          const priceMatch = details.match(/\$\d+\.\d{2}/);
          if (priceMatch) {
            price = priceMatch[0];
          }

          // Only add books with valid ISBNs
          if (isbn) {
            books.push({
              region,
              isbn,
              title,
              author,
              publisher,
              rank,
              category: currentCategory || null,
              week_date: weekDate,
              list_title: getListTitle(region),
              price,
            });
          }
        }
        i++; // Skip the details line since we processed it
      }
    }
  }

  return books;
}
