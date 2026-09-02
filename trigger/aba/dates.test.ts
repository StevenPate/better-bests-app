import { describe, it, expect } from "vitest";
import { publicationWednesday, priorWednesdays } from "./dates";

describe("publicationWednesday", () => {
  // The publication calendar is Pacific time. A late-Tuesday run in PT is
  // already Wednesday in UTC — computing in UTC front-runs ABA by a day
  // (found live 2026-09-01: the recheck ingested 09-02 on Tuesday evening).
  it("keeps Tuesday evening PT in the previous publication week", () => {
    // 2026-09-01T17:22 PDT == 2026-09-02T00:22Z (a Wednesday, UTC)
    expect(publicationWednesday(new Date("2026-09-02T00:22:00Z"))).toBe("2026-08-26");
  });

  it("flips at PT midnight into Wednesday", () => {
    // 2026-09-02T00:30 PDT == 07:30Z Wednesday
    expect(publicationWednesday(new Date("2026-09-02T07:30:00Z"))).toBe("2026-09-02");
  });

  it("returns the same day for a Wednesday morning PT", () => {
    // 8:05am PDT Wednesday
    expect(publicationWednesday(new Date("2026-09-02T15:05:00Z"))).toBe("2026-09-02");
  });

  it("holds through Wednesday evening PT (Thursday UTC)", () => {
    // 17:00 PDT Wednesday == 00:00Z Thursday
    expect(publicationWednesday(new Date("2026-09-03T00:00:00Z"))).toBe("2026-09-02");
  });

  it("maps a Sunday to the preceding Wednesday", () => {
    // 2026-09-06 noon PDT
    expect(publicationWednesday(new Date("2026-09-06T19:00:00Z"))).toBe("2026-09-02");
  });

  it("handles PST (winter) too", () => {
    // 2026-12-15 is a Tuesday; 18:00 PST == 02:00Z Wednesday Dec 16
    expect(publicationWednesday(new Date("2026-12-16T02:00:00Z"))).toBe("2026-12-09");
  });
});

describe("priorWednesdays", () => {
  it("steps back seven days at a time", () => {
    expect(priorWednesdays("2026-09-02", 2)).toEqual(["2026-08-26", "2026-08-19"]);
  });
});
