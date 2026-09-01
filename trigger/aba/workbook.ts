import { unzipSync, strFromU8 } from "fflate";

/**
 * Minimal xlsx reader for ABA bestseller workbooks.
 *
 * Cell data deliberately comes from the xlsx rather than any per-tab CSV
 * endpoint: Google's gviz endpoint silently returns the FIRST tab's data for
 * some tab names ("Childrens Series", "Childrens Series TItles") with no
 * detectable error. In the xlsx, tab name -> rels -> sheetN.xml is structural
 * and cannot mismatch.
 */

/** Extract sheet (tab) names from workbook.xml, in workbook order. */
export function parseTabNames(workbookXml: string): string[] {
  const names = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(
    (m) => decodeXmlEntities(m[1])
  );
  if (names.length === 0) {
    throw new Error("workbook.xml contained no sheet names");
  }
  return names;
}

/**
 * Parse a whole workbook: tab name -> rows of cell strings.
 *
 * Numbers are returned as their raw <v> text (e.g. "9.780063511637E12");
 * callers decide how to interpret them. Blank/omitted cells become "" and
 * column positions are preserved via each cell's r="A1" reference.
 */
export function parseWorkbook(bytes: Uint8Array): Map<string, string[][]> {
  const files = unzipSync(bytes);
  const read = (name: string): string => {
    const entry = files[name];
    if (!entry) throw new Error(`xlsx archive is missing ${name}`);
    return strFromU8(entry);
  };

  // 1. Tab names + their relationship ids, in order.
  const workbookXml = read("xl/workbook.xml");
  const sheets = [...workbookXml.matchAll(
    /<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="(rId\d+)"/g
  )].map((m) => ({ name: decodeXmlEntities(m[1]), rid: m[2] }));
  if (sheets.length === 0) throw new Error("workbook.xml contained no sheet names");

  // 2. rId -> worksheet path.
  const relsXml = read("xl/_rels/workbook.xml.rels");
  const rels = new Map(
    [...relsXml.matchAll(/<Relationship\b[^>]*\bId="(rId\d+)"[^>]*\bTarget="([^"]+)"/g)]
      .map((m) => [m[1], m[2].replace(/^\//, "")] as const)
  );

  // 3. Shared strings. An <si> may contain several rich-text runs; join all
  //    <t> contents.
  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const ss = read("xl/sharedStrings.xml");
    for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const text = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((t) => decodeXmlEntities(t[1]))
        .join("");
      shared.push(text);
    }
  }

  const out = new Map<string, string[][]>();
  for (const { name, rid } of sheets) {
    const target = rels.get(rid);
    if (!target) throw new Error(`workbook has no relationship for ${rid} ("${name}")`);
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    out.set(name, parseSheetXml(read(path), shared));
  }
  return out;
}

/** Convert "BC" -> 54 (0-indexed column). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetXml(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of rowMatch[1].matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    )) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const col = refMatch ? columnIndex(refMatch[1]) : cells.length;
      const typeMatch = attrs.match(/\bt="(\w+)"/);
      const type = typeMatch ? typeMatch[1] : "n";

      let value = "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => decodeXmlEntities(t[1]))
          .join("");
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/);
        if (v) {
          value = type === "s" ? shared[Number(v[1])] ?? "" : decodeXmlEntities(v[1]);
        }
      }
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    // Trim trailing blanks so a row's length reflects its real content —
    // styled-but-empty grid cells otherwise pad every row.
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    rows.push(cells);
  }
  return rows;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
