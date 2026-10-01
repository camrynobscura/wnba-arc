import { describe, it, expect } from "vitest";
import {
  espnForSlug,
  matchesForSlug,
  nameForSlug,
  playerPath,
  slugifyName,
  statPath,
  toMode,
  toStatKey,
} from "./routes";

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
  it("never guesses between two players with the same name", () => {
    const two = [...roster, { espn: "120", name: "Michelle Campbell" }, { espn: "2069162", name: "Michelle Campbell" }];
    expect(espnForSlug("michelle-campbell", two)).toBeNull();
    expect(matchesForSlug("michelle-campbell", two).map((p) => p.espn)).toEqual(["120", "2069162"]);
    expect(espnForSlug("michelle-campbell-120", two)).toBe("120");
    expect(matchesForSlug("michelle-campbell-120", two)).toEqual([]);
    expect(matchesForSlug("aja-wilson", two)).toHaveLength(1);
    expect(matchesForSlug("aja-wilson", null)).toEqual([]);
  });
  it("finds a player by a former name, and treats it like a name when it clashes", () => {
    const brodie = { espn: "3054590", name: "Nia Brodie", formerNames: ["Nia Coffey"] };
    const withBrodie = [...roster, brodie];
    expect(espnForSlug("nia-coffey", withBrodie)).toBe("3054590");
    expect(espnForSlug("nia-brodie", withBrodie)).toBe("3054590");
    expect(nameForSlug(brodie, "nia-coffey")).toBe("Nia Coffey");
    expect(nameForSlug(brodie, "nia-brodie")).toBe("Nia Brodie");
    expect(nameForSlug(brodie, "aja-wilson")).toBeNull();
    expect(playerPath("Nia Brodie", "3054590", withBrodie)).toBe("/player/nia-brodie");

    // A later player with the old name: the bare address names both, and her own links carry the id.
    const rookie = { espn: "999", name: "Nia Coffey" };
    const both = [...withBrodie, rookie];
    expect(espnForSlug("nia-coffey", both)).toBeNull();
    expect(matchesForSlug("nia-coffey", both).map((p) => p.espn)).toEqual(["3054590", "999"]);
    expect(playerPath("Nia Coffey", "999", both)).toBe("/player/nia-coffey-999");
    expect(playerPath("Nia Brodie", "3054590", both)).toBe("/player/nia-brodie");
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

describe("toMode — the heatmap's reference mode from ?vs=", () => {
  it("reads league and position, else defaults to self", () => {
    expect(toMode("league")).toBe("league");
    expect(toMode("position")).toBe("position");
    expect(toMode("self")).toBe("self");
    expect(toMode(null)).toBe("self");
    expect(toMode("garbage")).toBe("self");
  });

  it("is the ONE reader of ?vs= — the drill-down follows the same mode, self included", () => {
    expect(toMode("self")).toBe("self");
  });
});
