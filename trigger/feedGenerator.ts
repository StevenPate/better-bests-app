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
