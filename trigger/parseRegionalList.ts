export interface RegionalBook {
  region: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  rank: number;
  category: string | null;
  week_date: string;
  price: string | null;
}

function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, "");
}

export function parseRegionalList(
  content: string,
  region: string,
  weekDate: string
): RegionalBook[] {
  const lines = content
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line);
  const books: RegionalBook[] = [];
  let currentCategory = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.includes("INDEPENDENT BESTSELLERS") ||
      line.includes("Sales Week Ended") ||
      line.includes("Compiled by") ||
      line === "" ||
      line.startsWith("For more information")
    ) {
      continue;
    }

    // Category header: starts with an uppercase letter and contains only
    // uppercase letters, spaces, and common punctuation that appears in real
    // PNBA headers ("CHILDREN'S ILLUSTRATED", "EARLY & MIDDLE GRADE READERS").
    // Must be multi-word and not start with a digit.
    if (
      line.match(/^[A-Z][A-Z\s'&!-]*$/) &&
      line.length > 3 &&
      line.includes(" ") &&
      !line.match(/^\d+/)
    ) {
      currentCategory = line;
      continue;
    }

    // Book entry: starts with rank number
    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1]);
      const title = rankMatch[2].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : "";

      if (nextLine && !nextLine.match(/^\d+\./)) {
        const details = nextLine.trim();
        const parts = details.split(",").map((part) => part.trim());

        if (parts.length >= 2) {
          const author = parts[0];
          const publisher = parts.length >= 3 ? parts[1] : null;
          let isbn = "";
          let price: string | null = null;

          for (const part of parts) {
            const cleanPart = normalizeIsbn(part);
            if (cleanPart.match(/^\d{10}(\d{3})?$/)) {
              isbn = cleanPart;
              break;
            }
          }

          const priceMatch = details.match(/\$\d+\.\d{2}/);
          if (priceMatch) {
            price = priceMatch[0];
          }

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
              price,
            });
          }
        }
        i++; // Skip the details line
      }
    }
  }

  return books;
}
