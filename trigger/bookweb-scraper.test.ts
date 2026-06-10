import { describe, it, expect } from "vitest";
import { parseGoogleDriveUrls } from "./bookweb-scraper";

const MOCK_HTML = `
<html>
<body>
<h2>Regional Bestsellers</h2>
<p>Sales Week Ended Sunday, June 1, 2025</p>

<a href="https://drive.google.com/file/d/ABC123/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Pacific Northwest Booksellers Association (PNBA)</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/DEF456/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Northern CAL</u></span></font><font color="#0000ff"><span style="font-size:11pt">IBA</span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/GHI789/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Southern CALIBA</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/JKL012/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Great Lakes Independent Booksellers Association (GLIBA)</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/MNO345/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Mountains &amp; Plains Independent Booksellers Association (MPIBA)</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/PQR678/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Midwest Independent Booksellers Association (MIBA)</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/STU901/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>New Atlantic Independent Booksellers Association (NAIBA)</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/VWX234/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>New England Independent Booksellers Association (NEIBA)</u></span></font>
</a>
<br/>
<a href="https://drive.google.com/file/d/YZA567/view?usp=drive_link">
  <font color="#0000ff"><span style="font-size:11pt"><u>Southern Independent Booksellers Alliance (SIBA)</u></span></font>
</a>
<br/>
<!-- National Book Foundation link to a FOLDER (should be excluded) -->
<a href="https://drive.google.com/drive/folders/FOLDER_ID_HERE">
  <font color="#0000ff"><span style="font-size:11pt"><u>National Book Foundation</u></span></font>
</a>
</body>
</html>
`;

describe("parseGoogleDriveUrls", () => {
  it("should extract all 9 region URLs from mock HTML", () => {
    const { urls } = parseGoogleDriveUrls(MOCK_HTML);

    expect(Object.keys(urls)).toHaveLength(9);
    expect(urls.PNBA).toBe(
      "https://drive.usercontent.google.com/download?id=ABC123&export=download"
    );
    expect(urls.CALIBAN).toBe(
      "https://drive.usercontent.google.com/download?id=DEF456&export=download"
    );
    expect(urls.CALIBAS).toBe(
      "https://drive.usercontent.google.com/download?id=GHI789&export=download"
    );
    expect(urls.GLIBA).toBe(
      "https://drive.usercontent.google.com/download?id=JKL012&export=download"
    );
    expect(urls.MPIBA).toBe(
      "https://drive.usercontent.google.com/download?id=MNO345&export=download"
    );
    expect(urls.MIBA).toBe(
      "https://drive.usercontent.google.com/download?id=PQR678&export=download"
    );
    expect(urls.NAIBA).toBe(
      "https://drive.usercontent.google.com/download?id=STU901&export=download"
    );
    expect(urls.NEIBA).toBe(
      "https://drive.usercontent.google.com/download?id=VWX234&export=download"
    );
    expect(urls.SIBA).toBe(
      "https://drive.usercontent.google.com/download?id=YZA567&export=download"
    );
  });

  it("should extract week end date", () => {
    const { weekEndDate } = parseGoogleDriveUrls(MOCK_HTML);
    expect(weekEndDate).toBe("June 1, 2025");
  });

  it("should handle CALIBA text split across multiple font tags", () => {
    const html = `
      <a href="https://drive.google.com/file/d/SPLIT123/view?usp=drive_link">
        <font color="#0000ff"><span><u>Northern CAL</u></span></font><font color="#0000ff"><span>IBA</span></font>
      </a>
    `;
    const { urls } = parseGoogleDriveUrls(html);
    expect(urls.CALIBAN).toBe(
      "https://drive.usercontent.google.com/download?id=SPLIT123&export=download"
    );
  });

  it("should exclude folder links (National Book Foundation)", () => {
    const { urls } = parseGoogleDriveUrls(MOCK_HTML);
    // No key should map from a folder link
    const allValues = Object.values(urls);
    expect(allValues.every((u) => u.includes("/download"))).toBe(true);
    expect(allValues).not.toContain(
      expect.stringContaining("FOLDER_ID_HERE")
    );
  });

  it("should return empty urls for HTML with no matching links", () => {
    const html = "<html><body><p>No links here</p></body></html>";
    const { urls, weekEndDate } = parseGoogleDriveUrls(html);
    expect(Object.keys(urls)).toHaveLength(0);
    expect(weekEndDate).toBeNull();
  });

  it("should return null weekEndDate when date text is missing", () => {
    const html = `
      <a href="https://drive.google.com/file/d/X/view">
        <u>Pacific Northwest Booksellers Association (PNBA)</u>
      </a>
    `;
    const { weekEndDate } = parseGoogleDriveUrls(html);
    expect(weekEndDate).toBeNull();
  });

  it("should skip links whose text cannot be mapped to a region", () => {
    const html = `
      <a href="https://drive.google.com/file/d/UNKNOWN/view">
        <u>Some Unknown Association</u>
      </a>
    `;
    const { urls } = parseGoogleDriveUrls(html);
    expect(Object.keys(urls)).toHaveLength(0);
  });
});
