# IPC × ABA crossover marker — design

**Goal:** On the Independent Press Top 40 list, show at a glance how broadly a
title is charting on the ABA regional lists, and whether it is charting in the
viewer's own region.

**Status:** design validated 2026-09-24, not yet implemented.

---

## Why

The IPC list is national and the ABA lists are regional, and until now nothing
connected them. For an ordering decision the useful questions are "is this a
real indie hit or a one-region blip?" and "is it already moving in my store's
region, or is it selling everywhere except here?"

Measured against the 2026-09-23 list (80 titles), the overlap is worth showing:

| ABA regions, same week | IPC titles |
| ---------------------- | ---------- |
| 0                      | **58**     |
| 1                      | 11         |
| 2–3                    | 3          |
| 5–7                    | 4          |
| 8–9                    | 4          |

Two facts shaped the design:

- **Absence is the norm.** 58 of 80 titles chart nowhere on the ABA lists that
  week, so a marker flags the exception and 72% of rows stay clean.
- **Presence in your own region is a coin flip.** Of the 22 titles that do
  chart, 11 include PNBA and 11 do not. Neither state is the exception, so both
  must be stated explicitly rather than one being implied by silence. The 10
  titles charting elsewhere but not in your region are the most actionable set
  on the page — the "Elsewhere" premise, surfacing inside the IPC list.

## Decisions

| Decision      | Choice                            | Rejected                                                                                     |
| ------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Signal        | Breadth (count of regions) + rank in the viewer's region | PNBA-only (silent on the 10-title opportunity set); breadth alone (loses the local signal)   |
| Window        | Same week                         | 4 weeks (39/80 marked), 13 weeks (45/80), ever (55/80 — badge becomes the default state)      |
| Placement     | Inline on the author line         | New table column (changes shape of a component nine ABA pages share; tight on mobile); after the title (interrupts the main scanning axis) |
| "My region"   | Picker on the page                | Hardcoded PNBA (wrong for other regions' visitors); read localStorage silently (invisible)     |

Same week was chosen because both lists cover the same sales week, so it is a
like-for-like comparison, and because it keeps the marker rare. The cost: a
title that charted 7 of the last 8 weeks but dipped this week shows nothing.

## Design

### Region picker

A `Compare against: [PNBA ▾]` select in the page header, beside Download CSV.

Initial value reads the existing `preferred-region` localStorage key, falling
back to `DEFAULT_REGION`. That key is currently **written** in
`src/contexts/RegionContext.tsx:54` and read nowhere — this finally consumes it
without changing what writes it.

The selection lives in page state only. Choosing SIBA here must not hijack the
nav region elsewhere in the app.

### Data

`useAbaRegionCounts(isbns, weekDate)` queries `regional_bestsellers` for
`isbn, region, rank`, filtered to that week, to `ABA_REGION_CODES`, and to the
~80 IPC ISBNs.

Per ISBN it builds `{ regions: Set<string>, rankByRegion: Map<string, number> }`:

- dedupe `(isbn, region)` — ABA stores every list membership, so one title can
  hold several rows within a single region
- keep the **best** (lowest) rank where a title occupies several category slots
  in one region

**The ISBN filter is load-bearing.** Fetching all ABA rows for a week is roughly
1,485 and would silently truncate at PostgREST's 1000-row default; narrowing by
ISBN returns 75 for the 2026-09-23 list. Reusing `ABA_REGION_CODES` also means
IPC can never count itself as one of its own regions.

One fetch serves all nine picker choices, so switching regions is instant and
does no network work.

### Display

On the author line, when the region count is above zero:

```
Kathryn Stockett · 5 regions · PNBA #3
A Writer         · 3 regions · not PNBA     ← tinted
Some Indie Novel                            ← clean
```

- `1 region` at one, `all 9 regions` at nine
- zero or missing renders nothing
- the `not <REGION>` case takes a distinct tint — that is the opportunity set

### Threading

`BookListDisplay` → `BestsellerTable` → `BookRow` each take an optional
annotation prop plus the selected region code. Named for what they are, not a
generic "annotations" slot. The nine ABA region pages pass nothing and render
byte-identically to today.

### Loading and failure

The count query runs independently of the list query. The list renders as soon
as it arrives and markers fill in after — appended inline text, so nothing
reflows. A failed count query degrades to no markers, never to an error state:
the list is fully useful without them.

## Testing

- `useAbaRegionCounts`: dedupes multi-category rows within a region; excludes
  IPC; keeps the best rank; returns nothing for unmatched ISBNs
- `BookRow`: renders all four states (clean, `1 region`, `n regions · REGION #r`,
  `n regions · not REGION`); renders nothing when the prop is absent
- Picker: switching regions re-renders without refetching
- Regression: an ABA region page passing no annotation prop is unchanged

## Out of scope

- Making the marker a link. The title already links to the book detail page,
  whose regional heat map shows exactly which regions and at what rank.
- Persisting the picker back to `preferred-region`. Reading it is useful;
  writing it from here would surprise people by changing their nav region.
- Any window other than same-week, and any signal on the ABA pages pointing back
  at IPC. That inverse badge stays deferred in the ingestion plan.
