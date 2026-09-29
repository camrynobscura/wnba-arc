import { describe, expect, it } from "vitest";
import { freshnessLine } from "./Footer";

describe("freshnessLine", () => {
  it("prefers the last completed game date, read as a calendar day (no UTC off-by-one)", () => {
    const f = freshnessLine({ lastScrapedAt: "2026-09-24T09:00:00.000Z", statsThrough: "2026-09-23" });
    expect(f).toEqual({ lead: "Stats through", day: "Sep 23, 2026", dateTime: "2026-09-23" });
  });

  it("falls back to the scrape time when the API has no game date (older builds, or none recorded)", () => {
    expect(freshnessLine({ lastScrapedAt: "2026-09-24T09:00:00.000Z", statsThrough: null })?.lead).toBe(
      "Data current as of",
    );
    expect(freshnessLine({ lastScrapedAt: "2026-09-24T09:00:00.000Z" })?.lead).toBe("Data current as of");
  });

  it("is null with nothing to say — the chip hides rather than showing an empty line", () => {
    expect(freshnessLine(null)).toBeNull();
    expect(freshnessLine({ lastScrapedAt: null, statsThrough: null })).toBeNull();
    expect(freshnessLine({ lastScrapedAt: "garbage", statsThrough: "2026-9-3" })).toBeNull();
  });
});
