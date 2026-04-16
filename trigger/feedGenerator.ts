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
