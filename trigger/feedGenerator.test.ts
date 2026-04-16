import { describe, it, expect } from "vitest";
import { buildBookSenseImageUrls } from "./feedGenerator";

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
