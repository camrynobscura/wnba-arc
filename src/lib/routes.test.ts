import { describe, it, expect } from "vitest";
import { espnForSlug, playerPath, slugifyName, statPath, toMode, toStatKey, toTarget } from "./routes";

const roster = [
  { espn: "3149391", name: "A'ja Wilson" },
  { espn: "3058901", name: "Kelsey Mitchell" },
  { espn: "2491205", name: "Nneka Ogwumike" },
];

describe("slugifyName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyName("Nneka Ogwumike")).toBe("nneka-ogwumike");
  });
  it("strips diacritics", () => {
    expect(slugifyName("Émilie Gómez")).toBe("emilie-gomez");
  });
  it("drops apostrophes rather than turning them into hyphens", () => {
    expect(slugifyName("A'ja Wilson")).toBe("aja-wilson");
    expect(slugifyName("A’ja Wilson")).toBe("aja-wilson"); // curly apostrophe
  });
  it("collapses runs of punctuation/space and trims", () => {
    expect(slugifyName("  Smith-Jones,  Jr.  ")).toBe("smith-jones-jr");
  });
});

describe("playerPath / statPath", () => {
  it("builds a name-only path — no espn id surfaced", () => {
    expect(playerPath("A'ja Wilson", "3149391")).toBe("/player/aja-wilson");
  });
  it("appends the stat key", () => {
    expect(statPath("A'ja Wilson", "3149391", "blk")).toBe("/player/aja-wilson/blk");
  });
  it("falls back to the bare id when the name has no slug-able characters", () => {
    expect(playerPath("", "3149391")).toBe("/player/3149391");
  });
  it("stays name-only when the slug is unique in the roster", () => {
    expect(playerPath("A'ja Wilson", "3149391", roster)).toBe("/player/aja-wilson");
  });
  it("disambiguates with the id ONLY when another current player shares the slug", () => {
    const dup = [
      { espn: "111", name: "Alyssa Thomas" },
      { espn: "222", name: "Alyssa Thomas" }, // hypothetical identical-slug collision
    ];
    expect(playerPath("Alyssa Thomas", "111", dup)).toBe("/player/alyssa-thomas-111");
    expect(playerPath("Alyssa Thomas", "222", dup)).toBe("/player/alyssa-thomas-222");
  });
});

describe("espnForSlug", () => {
  it("resolves a name-slug against the roster", () => {
    expect(espnForSlug("aja-wilson", roster)).toBe("3149391");
    expect(espnForSlug("nneka-ogwumike", roster)).toBe("2491205");
  });
  it("round-trips playerPath through the roster", () => {
    const p = playerPath("Kelsey Mitchell", "3058901", roster);
    expect(espnForSlug(p.split("/").pop(), roster)).toBe("3058901");
  });
  it("accepts the id-form (collision/legacy) without needing the roster", () => {
    expect(espnForSlug("alyssa-thomas-111", null)).toBe("111");
    expect(espnForSlug("3149391", null)).toBe("3149391");
  });
  it("returns null for a name-slug when the roster isn't loaded yet", () => {
    expect(espnForSlug("aja-wilson", null)).toBeNull();
  });
  it("returns null when nothing matches", () => {
    expect(espnForSlug("not-a-player", roster)).toBeNull();
    expect(espnForSlug(undefined, roster)).toBeNull();
  });
});

describe("toStatKey", () => {
  it("accepts known stat keys", () => {
    expect(toStatKey("blk")).toBe("blk");
    expect(toStatKey("tsPct")).toBe("tsPct");
  });
  it("rejects unknown segments", () => {
    expect(toStatKey("bogus")).toBeNull();
    expect(toStatKey(undefined)).toBeNull();
  });
});

describe("toTarget", () => {
  it("reads position, else defaults to league", () => {
    expect(toTarget("position")).toBe("position");
    expect(toTarget("league")).toBe("league");
    expect(toTarget(null)).toBe("league");
    expect(toTarget("garbage")).toBe("league");
  });
});

describe("toMode — the heatmap's reference mode from ?vs=", () => {
  it("reads league and position, else defaults to self", () => {
    expect(toMode("league")).toBe("league");
    expect(toMode("position")).toBe("position");
    expect(toMode("self")).toBe("self");
    expect(toMode(null)).toBe("self");
    expect(toMode("garbage")).toBe("self");
  });

  it("agrees with toTarget on what the drill-down sees: self reads through as league", () => {
    // The drill-down has no "self" baseline, so a vs=self URL must resolve to league there while
    // the heatmap keeps self — the two readers of the same param, kept consistent.
    expect(toTarget("self")).toBe("league");
    expect(toMode("self")).toBe("self");
  });
});
