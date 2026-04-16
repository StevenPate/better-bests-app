export function buildBookSenseImageUrls(isbn: string): {
  small: string;
  large: string;
} {
  const normalized = isbn.replace(/[-\s]/g, "");
  if (!/^\d{13}$/.test(normalized)) {
    throw new Error(
      `buildBookSenseImageUrls: expected 13-digit ISBN, got ${JSON.stringify(isbn)}`
    );
  }
  const last3 = normalized.slice(-3);
  const mid3 = normalized.slice(-6, -3);
  return {
    small: `https://images.booksense.com/images/books/${last3}/${mid3}/FC${normalized}.JPG`,
    large: `https://images.booksense.com/images/${last3}/${mid3}/${normalized}.jpg`,
  };
}

const MAX_DESCRIPTION_LENGTH = 500;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&mdash;": "—",
  "&ndash;": "–",
  "&nbsp;": " ",
  "&rsquo;": "\u2019",
  "&lsquo;": "\u2018",
  "&rdquo;": "\u201d",
  "&ldquo;": "\u201c",
  "&hellip;": "\u2026",
};

export function sanitizeDescription(raw: string): string {
  if (!raw) return "";

  // 1. Strip HTML tags
  let text = raw.replace(/<[^>]*>/g, "");

  // 2. Decode common HTML entities
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(replacement);
  }

  // Decode numeric HTML entities (decimal and hex)
  text = text.replace(/&#(\d+);/g, (_, n) => {
    const code = parseInt(n, 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    const code = parseInt(h, 16);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });

  // 3. Collapse whitespace runs
  text = text.replace(/\s+/g, " ");

  // 4. Trim
  text = text.trim();

  if (!text) return "";

  // 5. Cap length with word-boundary truncation
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    const cutoff = MAX_DESCRIPTION_LENGTH - 1; // leave room for ellipsis
    const slice = text.slice(0, cutoff);
    const lastSpace = slice.lastIndexOf(" ");
    const truncated = lastSpace > cutoff * 0.5 ? slice.slice(0, lastSpace) : slice;
    text = truncated + "…";
  }

  return text;
}

export function composeBlurb(
  description: string,
  last: string,
  weeksOnList: string
): string {
  return `${description}\nRank last week: ${last}\nWeeks on list: ${weeksOnList}`;
}

export interface PreviousWeekBook {
  isbn: string;
  rank: number;
}

export function computeLastRank(
  isbn: string,
  previous: PreviousWeekBook[]
): string {
  const match = previous.find((b) => b.isbn === isbn);
  return match ? String(match.rank) : "NEW";
}

export interface CurrentBook {
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  rank: number;
  category: string | null;
}

export interface AssembleArgs {
  region: { abbreviation: string; full_name: string };
  weekDate: Date;
  currentBooks: CurrentBook[];
  previousBooks: PreviousWeekBook[];
  weeksOnList: Record<string, number>;
  descriptions: Record<string, string>;
}

export interface FeedEntry {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  description: string;
  blurb: string;
  small_image_uri: string;
  large_image_uri: string;
  rank: string;
  last: string;
  weeks_on_list: string;
}

export interface FeedSection {
  title: string;
  entries: FeedEntry[];
}

export interface Feed {
  title: string;
  description: string;
  for_date: string;
  end_date: string;
  sections: FeedSection[];
}

const LONG_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
};

function formatLongDate(d: Date): string {
  const base = d.toLocaleDateString("en-US", LONG_DATE_OPTIONS);
  // "April 15, 2026" → "April 15th, 2026"
  return base.replace(/(\d+),/, (_, n) => `${ordinalSuffix(parseInt(n, 10))},`);
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function subtractDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

export function assembleFeedJson(args: AssembleArgs): Feed {
  const forDate = formatISO(args.weekDate);
  const endDate = formatISO(subtractDays(args.weekDate, 3)); // Wed → Sun

  const sectionMap = new Map<string, FeedEntry[]>();

  for (const book of args.currentBooks) {
    let urls: { small: string; large: string };
    try {
      urls = buildBookSenseImageUrls(book.isbn);
    } catch {
      continue; // Skip entries with invalid ISBNs
    }

    const rawDescription = args.descriptions[book.isbn] ?? "";
    const description = sanitizeDescription(rawDescription);
    const last = computeLastRank(book.isbn, args.previousBooks);
    const weeks = String(args.weeksOnList[book.isbn] ?? 0);

    const entry: FeedEntry = {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      publisher: book.publisher ?? "",
      description,
      blurb: composeBlurb(description, last, weeks),
      small_image_uri: urls.small,
      large_image_uri: urls.large,
      rank: String(book.rank),
      last,
      weeks_on_list: weeks,
    };

    const sectionTitle = book.category ?? "UNCATEGORIZED";
    const bucket = sectionMap.get(sectionTitle) ?? [];
    bucket.push(entry);
    sectionMap.set(sectionTitle, bucket);
  }

  const sections: FeedSection[] = Array.from(sectionMap.entries()).map(
    ([title, entries]) => ({
      title,
      entries: entries.sort(
        (a, b) => parseInt(a.rank, 10) - parseInt(b.rank, 10)
      ),
    })
  );

  return {
    title: `${args.region.abbreviation} Indie Bestsellers for ${formatLongDate(args.weekDate)}`,
    description: `For the week ending ${formatLongDate(subtractDays(args.weekDate, 3))}, based on sales in independent bookstores from the ${args.region.full_name}.`,
    for_date: forDate,
    end_date: endDate,
    sections,
  };
}
