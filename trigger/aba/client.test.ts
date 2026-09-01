import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSheetId, sheetUrls, fetchRegionWeek } from "./client";

const xlsxBytes = readFileSync(
  join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26.xlsx")
);

afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler: (url: string) => Partial<Response>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, ...handler(url) })));
}

describe("sheetUrls", () => {
  it("builds the shortlink for a region and week", () => {
    expect(sheetUrls("pnba", "2026-08-26").shortlink).toBe(
      "https://abaorg.link/pnba-bestsellers-sheet-2026-08-26"
    );
  });

  it("builds the xlsx export url from a sheet id", () => {
    expect(sheetUrls("pnba", "2026-08-26").xlsx("abc")).toBe(
      "https://docs.google.com/spreadsheets/d/abc/export?format=xlsx"
    );
  });
});

describe("resolveSheetId", () => {
  it("extracts the sheet id from the redirect target", async () => {
    stubFetch(() => ({
      url: "https://docs.google.com/spreadsheets/d/SHEET123/edit?usp=drivesdk",
    }));
    await expect(resolveSheetId("pnba", "2026-08-26")).resolves.toBe("SHEET123");
  });

  it("returns null when the shortlink does not redirect to Sheets", async () => {
    stubFetch(() => ({
      url: "https://abaorg.link/pnba-bestsellers-sheet-2099-01-01",
    }));
    await expect(resolveSheetId("pnba", "2099-01-01")).resolves.toBeNull();
  });
});

describe("fetchRegionWeek", () => {
  function stubHappyPath() {
    stubFetch((url) => {
      if (url.includes("abaorg.link")) {
        return { url: "https://docs.google.com/spreadsheets/d/X/edit" };
      }
      return {
        url,
        arrayBuffer: async () =>
          xlsxBytes.buffer.slice(
            xlsxBytes.byteOffset,
            xlsxBytes.byteOffset + xlsxBytes.byteLength
          ),
      } as Partial<Response>;
    });
  }

  it("returns every mapped category with rows from the right tab", async () => {
    stubHappyPath();
    const week = await fetchRegionWeek("pnba", "2026-08-26");
    expect(week).not.toBeNull();
    expect(week!.dbRegion).toBe("PNBA");
    expect(week!.sheetId).toBe("X");
    // 11 ingestable categories: 13 tabs minus Childrens Series + Report Details
    expect(week!.byCategory.size).toBe(11);
    expect(week!.byCategory.get("HARDCOVER FICTION")![0].title).toBe("Whistler");
    expect(week!.byCategory.get("MASS MARKET")![0].title).toBe("1984");
  });

  it("returns null when the week is not published yet", async () => {
    stubFetch(() => ({ url: "https://abaorg.link/nope" }));
    await expect(fetchRegionWeek("pnba", "2099-01-01")).resolves.toBeNull();
  });

  it("rejects a workbook whose Report Details disagree with the request", async () => {
    stubHappyPath();
    await expect(fetchRegionWeek("pnba", "2026-08-19")).rejects.toThrow(
      /week date mismatch/i
    );
  });

  it("rejects a workbook for the wrong region", async () => {
    stubHappyPath();
    await expect(fetchRegionWeek("siba", "2026-08-26")).rejects.toThrow(
      /region mismatch/i
    );
  });

  it("fails loudly on an unrecognized tab name", async () => {
    stubHappyPath();
    await expect(
      fetchRegionWeek("pnba", "2026-08-26", {
        _tabFilter: (tabs) => [...tabs, "Graphic Novels"],
      })
    ).rejects.toThrow(/unrecognized sheet tab: "Graphic Novels"/i);
  });

  it("throws for an unknown region slug", async () => {
    await expect(fetchRegionWeek("national", "2026-08-26")).rejects.toThrow(
      /unknown region slug/i
    );
  });
});
