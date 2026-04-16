import { describe, it, expect } from "vitest";
import { buildBookSenseImageUrls } from "./feedGenerator";
import { sanitizeDescription } from "./feedGenerator";

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
