import { describe, it, expect } from "vitest";
import { buildBookSenseImageUrls } from "./feedGenerator";
import { sanitizeDescription } from "./feedGenerator";
import { composeBlurb } from "./feedGenerator";
import { computeLastRank } from "./feedGenerator";
import { assembleFeedJson } from "./feedGenerator";

describe("buildBookSenseImageUrls", () => {
  it("builds correct small and large URLs for a 13-digit ISBN", () => {
    const result = buildBookSenseImageUrls("9780593804216");
    expect(result).toEqual({
      small: "https://images.booksense.com/images/books/216/804/FC9780593804216.JPG",
      large: "https://images.booksense.com/images/216/804/9780593804216.jpg",
    });
  });

  it("strips hyphens and whitespace before validation", () => {
    const result = buildBookSenseImageUrls("978-0593-804216");
    expect(result.large).toBe(
      "https://images.booksense.com/images/216/804/9780593804216.jpg"
    );
  });

  it("throws on ISBN shorter than 13 digits", () => {
    expect(() => buildBookSenseImageUrls("978059380421")).toThrow();
  });

  it("throws on ISBN longer than 13 digits", () => {
    expect(() => buildBookSenseImageUrls("97805938042160")).toThrow();
  });

  it("throws on non-numeric ISBN", () => {
    expect(() => buildBookSenseImageUrls("978059380421X")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => buildBookSenseImageUrls("")).toThrow();
  });
});

describe("sanitizeDescription", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeDescription("")).toBe("");
  });

  it("passes plain text through unchanged", () => {
    expect(sanitizeDescription("plain text")).toBe("plain text");
  });

  it("preserves quotes (JSON escaping handled downstream)", () => {
    expect(sanitizeDescription('he said "hi"')).toBe('he said "hi"');
  });

  it("collapses newlines to single spaces", () => {
    expect(sanitizeDescription("line 1\nline 2")).toBe("line 1 line 2");
  });

  it("strips HTML tags", () => {
    expect(sanitizeDescription("<p>para</p>")).toBe("para");
    expect(sanitizeDescription("bold <b>word</b> here")).toBe("bold word here");
  });

  it("decodes common HTML entities", () => {
    expect(sanitizeDescription("Smith &amp; Jones")).toBe("Smith & Jones");
    expect(sanitizeDescription("&quot;quoted&quot;")).toBe('"quoted"');
    expect(sanitizeDescription("it&#39;s")).toBe("it's");
    expect(sanitizeDescription("one&mdash;two")).toBe("one—two");
    expect(sanitizeDescription("a&nbsp;b")).toBe("a b");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeDescription("  padded  ")).toBe("padded");
  });

  it("collapses internal whitespace runs to single spaces", () => {
    expect(sanitizeDescription("a   b\t\tc")).toBe("a b c");
  });

  it("caps length at 500 characters with ellipsis", () => {
    const long = "a".repeat(600);
    const result = sanitizeDescription(long);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.endsWith("…")).toBe(true);
  });

  it("truncates at word boundary when possible", () => {
    const words = "word ".repeat(200);
    const result = sanitizeDescription(words);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/wor…$/);
  });

  it("returns empty string if input becomes empty after sanitization", () => {
    expect(sanitizeDescription("<p></p>")).toBe("");
    expect(sanitizeDescription("   ")).toBe("");
  });

  it("decodes curly quote entities", () => {
    expect(sanitizeDescription("it&rsquo;s")).toBe("it\u2019s");
    expect(sanitizeDescription("&ldquo;quoted&rdquo;")).toBe("\u201cquoted\u201d");
  });

  it("decodes ellipsis entity", () => {
    expect(sanitizeDescription("wait&hellip;")).toBe("wait\u2026");
  });

  it("decodes decimal numeric entities", () => {
    expect(sanitizeDescription("em&#8212;dash")).toBe("em\u2014dash");
    expect(sanitizeDescription("en&#8211;dash")).toBe("en\u2013dash");
  });

  it("decodes hex numeric entities", () => {
    expect(sanitizeDescription("em&#x2014;dash")).toBe("em\u2014dash");
  });

  it("drops invalid numeric entities", () => {
    expect(sanitizeDescription("bad&#0;x")).toBe("badx");
  });
});

describe("composeBlurb", () => {
  it("composes a blurb with description, last rank, and weeks on list", () => {
    const result = composeBlurb("A great book.", "NEW", "1");
    expect(result).toBe("A great book.\nRank last week: NEW\nWeeks on list: 1");
  });

  it("handles empty description", () => {
    const result = composeBlurb("", "3", "12");
    expect(result).toBe("\nRank last week: 3\nWeeks on list: 12");
  });

  it("handles numeric last rank", () => {
    const result = composeBlurb("Desc", "5", "7");
    expect(result).toBe("Desc\nRank last week: 5\nWeeks on list: 7");
  });

  it("does not sanitize (caller's responsibility)", () => {
    const result = composeBlurb("has <p>tags</p>", "NEW", "1");
    expect(result).toContain("<p>tags</p>");
  });
});

describe("computeLastRank", () => {
  it("returns previous rank as string when ISBN found on previous week", () => {
    const previous = [
      { isbn: "9780000000001", rank: 3 },
      { isbn: "9780000000002", rank: 5 },
    ];
    expect(computeLastRank("9780000000001", previous)).toBe("3");
  });

  it("returns NEW when ISBN not on previous week", () => {
    const previous = [{ isbn: "9780000000001", rank: 3 }];
    expect(computeLastRank("9780000000999", previous)).toBe("NEW");
  });

  it("returns NEW when previous week is empty", () => {
    expect(computeLastRank("9780000000001", [])).toBe("NEW");
  });

  it("matches by ISBN only, ignoring other fields", () => {
    const previous = [
      { isbn: "9780000000001", rank: 3, category: "FICTION" },
    ];
    expect(computeLastRank("9780000000001", previous)).toBe("3");
  });
});

describe("assembleFeedJson", () => {
  const baseArgs = {
    region: { abbreviation: "PNBA", full_name: "Pacific Northwest Booksellers Association" },
    weekDate: new Date("2026-04-15T00:00:00Z"),
    currentBooks: [
      {
        isbn: "9780593804216",
        title: "Yesteryear",
        author: "Caro Claire Burke",
        publisher: "Knopf",
        rank: 1,
        category: "HARDCOVER FICTION",
      },
      {
        isbn: "9780593798430",
        title: "The Correspondent",
        author: "Virginia Evans",
        publisher: "Crown",
        rank: 2,
        category: "HARDCOVER FICTION",
      },
      {
        isbn: "9781234567890",
        title: "Some NF Book",
        author: "Author X",
        publisher: "Pub Y",
        rank: 1,
        category: "HARDCOVER NONFICTION",
      },
    ],
    previousBooks: [
      { isbn: "9780593798430", rank: 1 },
    ],
    weeksOnList: {
      "9780593804216": 1,
      "9780593798430": 35,
      "9781234567890": 10,
    },
    descriptions: {
      "9780593804216": "A traditional American woman awakens in 1855.",
      "9780593798430": "A woman heals through letters.",
    },
  };

  it("produces top-level fields in the reference shape", () => {
    const feed = assembleFeedJson(baseArgs);
    expect(feed.title).toMatch(/^PNBA/);
    expect(feed.for_date).toBe("2026-04-15");
    expect(feed.end_date).toBe("2026-04-12");
    expect(typeof feed.description).toBe("string");
    expect(Array.isArray(feed.sections)).toBe(true);
  });

  it("groups entries into sections by category", () => {
    const feed = assembleFeedJson(baseArgs);
    expect(feed.sections).toHaveLength(2);
    const fictionSection = feed.sections.find(
      (s) => s.title === "HARDCOVER FICTION"
    );
    expect(fictionSection?.entries).toHaveLength(2);
    const nfSection = feed.sections.find((s) => s.title === "HARDCOVER NONFICTION");
    expect(nfSection?.entries).toHaveLength(1);
  });

  it("emits rank, last, weeks_on_list as strings", () => {
    const feed = assembleFeedJson(baseArgs);
    const entry = feed.sections[0].entries[0];
    expect(typeof entry.rank).toBe("string");
    expect(typeof entry.last).toBe("string");
    expect(typeof entry.weeks_on_list).toBe("string");
  });

  it("marks books not on previous week as NEW", () => {
    const feed = assembleFeedJson(baseArgs);
    const yesteryear = feed.sections
      .flatMap((s) => s.entries)
      .find((e) => e.isbn === "9780593804216");
    expect(yesteryear?.last).toBe("NEW");
  });

  it("uses previous rank when ISBN was on previous week", () => {
    const feed = assembleFeedJson(baseArgs);
    const correspondent = feed.sections
      .flatMap((s) => s.entries)
      .find((e) => e.isbn === "9780593798430");
    expect(correspondent?.last).toBe("1");
  });

  it("composes blurb with description, last, and weeks_on_list", () => {
    const feed = assembleFeedJson(baseArgs);
    const yesteryear = feed.sections
      .flatMap((s) => s.entries)
      .find((e) => e.isbn === "9780593804216");
    expect(yesteryear?.blurb).toBe(
      "A traditional American woman awakens in 1855.\nRank last week: NEW\nWeeks on list: 1"
    );
  });

  it("emits empty description when ISBN not in descriptions map", () => {
    const feed = assembleFeedJson(baseArgs);
    const nfBook = feed.sections
      .flatMap((s) => s.entries)
      .find((e) => e.isbn === "9781234567890");
    expect(nfBook?.description).toBe("");
    expect(nfBook?.blurb).toBe("\nRank last week: NEW\nWeeks on list: 10");
  });

  it("constructs BookSense image URLs for each entry", () => {
    const feed = assembleFeedJson(baseArgs);
    const yesteryear = feed.sections
      .flatMap((s) => s.entries)
      .find((e) => e.isbn === "9780593804216");
    expect(yesteryear?.small_image_uri).toBe(
      "https://images.booksense.com/images/books/216/804/FC9780593804216.JPG"
    );
    expect(yesteryear?.large_image_uri).toBe(
      "https://images.booksense.com/images/216/804/9780593804216.jpg"
    );
  });

  it("sorts entries within a section by rank ascending", () => {
    const feed = assembleFeedJson(baseArgs);
    const fiction = feed.sections.find((s) => s.title === "HARDCOVER FICTION");
    expect(fiction?.entries.map((e) => e.rank)).toEqual(["1", "2"]);
  });

  it("skips entries whose ISBN fails validation rather than throwing", () => {
    const args = {
      ...baseArgs,
      currentBooks: [
        ...baseArgs.currentBooks,
        {
          isbn: "BAD",
          title: "Bad",
          author: "X",
          publisher: "Y",
          rank: 99,
          category: "HARDCOVER FICTION",
        },
      ],
    };
    const feed = assembleFeedJson(args);
    const fiction = feed.sections.find((s) => s.title === "HARDCOVER FICTION");
    expect(fiction?.entries.every((e) => e.isbn !== "BAD")).toBe(true);
    expect(fiction?.entries).toHaveLength(2);
  });

  it("produces the exact reference-compatible title string", () => {
    const feed = assembleFeedJson(baseArgs);
    expect(feed.title).toBe("PNBA Indie Bestsellers for April 15th, 2026");
  });

  it("produces the exact reference-compatible description string", () => {
    const feed = assembleFeedJson(baseArgs);
    expect(feed.description).toBe(
      "For the week ending April 12th, 2026, based on sales in independent bookstores from the Pacific Northwest Booksellers Association."
    );
  });

  it("emits '0' for weeks_on_list when no entry in the weeksOnList map", () => {
    const args = { ...baseArgs, weeksOnList: {} };
    const feed = assembleFeedJson(args);
    const entry = feed.sections.flatMap((s) => s.entries)[0];
    expect(entry.weeks_on_list).toBe("0");
  });

  it("groups books with null category under 'UNCATEGORIZED'", () => {
    const args = {
      ...baseArgs,
      currentBooks: [
        {
          isbn: "9780593804216",
          title: "No Category",
          author: "A",
          publisher: "P",
          rank: 1,
          category: null,
        },
      ],
    };
    const feed = assembleFeedJson(args);
    expect(feed.sections.map((s) => s.title)).toContain("UNCATEGORIZED");
  });
});
