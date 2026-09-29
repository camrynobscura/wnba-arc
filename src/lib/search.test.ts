import { describe, expect, it } from "vitest";
import type { PlayerSummary } from "../data/api";
import { fold, foldWords, matchTier, rankPlayers } from "./search";

const mk = (name: string, over: Partial<PlayerSummary> = {}): PlayerSummary => ({
  id: name,
  espn: name,
  name,
  team: null,
  teamAbbr: null,
  pos: null,
  jersey: null,
  active: true,
  firstYear: 2020,
  lastYear: 2026,
  ...over,
});

// A slice of the real roster, in roster (alphabetical) order, with the 2026 "current" year.
const roster: PlayerSummary[] = [
  mk("A'ja Wilson", { team: "Las Vegas Aces" }),
  mk("Alisa Burras", { lastYear: 2005 }),
  mk("Elisabeth Cebrian", { lastYear: 2000 }),
  mk("Isabelle Harrison", { team: "Connecticut Sun", lastYear: 2026 }),
  mk("Nyara Sabally", { team: "New York Liberty" }),
  mk("Sabrina Ionescu", { team: "New York Liberty" }),
  mk("Sabrina Palie", { lastYear: 2004 }),
  mk("Satou Sabally", { team: "Dallas Wings" }),
  mk("Sun Ling", { lastYear: 1999 }),
  mk("Tina Charles", { team: "Connecticut Sun" }),
];

/** A roster player by name — so a test doesn't depend on where they sit in the list. */
const byName = (n: string): PlayerSummary => roster.find((p) => p.name === n)!;

describe("fold / foldWords", () => {
  it("strips accents, apostrophes and punctuation, keeps the words", () => {
    expect(foldWords("A'ja Wilson")).toEqual(["aja", "wilson"]);
    expect(foldWords("Iliana Rupert-Méndez")).toEqual(["iliana", "rupert", "mendez"]);
    expect(fold("A'ja Wilson")).toBe("ajawilson");
    expect(foldWords("  ")).toEqual([]);
  });
});

describe("matchTier", () => {
  it("0 when every word starts a name word, whatever the order", () => {
    expect(matchTier(roster[5], ["sab"])).toBe(0);
    expect(matchTier(roster[5], ["sabrina", "io"])).toBe(0);
    expect(matchTier(roster[5], ["ionescu", "sab"])).toBe(0);
    expect(matchTier(roster[0], ["aja"])).toBe(0); // the apostrophe case is a word start
  });
  it("1 when a word matches only via the team", () => {
    expect(matchTier(byName("Tina Charles"), ["sun"])).toBe(1);
    expect(matchTier(byName("Tina Charles"), ["tina", "sun"])).toBe(1);
  });
  it("2 when a word matches only inside a name word or across a boundary", () => {
    expect(matchTier(roster[1], ["sab"])).toBe(2); // ali-SAB-urras
    expect(matchTier(roster[3], ["sab"])).toBe(2); // i-SAB-elle
  });
  it("null when any word matches nothing", () => {
    expect(matchTier(roster[5], ["sab", "zzz"])).toBeNull();
    expect(matchTier(roster[1], ["sun"])).toBeNull();
  });
});

describe("rankPlayers", () => {
  const names = (q: string) => rankPlayers(roster, q).map((p) => p.name);

  it("puts word-start matches first, current before past, first-name matches next, then alphabetical", () => {
    expect(names("sab")).toEqual([
      "Sabrina Ionescu", // tier 0, current, first name
      "Nyara Sabally", // tier 0, current, last name
      "Satou Sabally", // tier 0, current, last name
      "Sabrina Palie", // tier 0, past (2004) — a first-name match, but current outranks it
      "Isabelle Harrison", // tier 2, current
      "Alisa Burras", // tier 2, past
      "Elisabeth Cebrian", // tier 2, past
    ]);
  });

  it("finds a two-word query in either order, at the top", () => {
    expect(names("sabrina io")[0]).toBe("Sabrina Ionescu");
    expect(names("ionescu sab")[0]).toBe("Sabrina Ionescu");
    expect(names("io sabrina")).toEqual(["Sabrina Ionescu"]);
  });

  it("team matches sit in their own tier under name matches", () => {
    // "sun": Sun Ling's NAME starts with it (tier 0, past); the Sun roster is tier 1.
    expect(names("sun")).toEqual(["Sun Ling", "Isabelle Harrison", "Tina Charles"]);
  });

  it("keeps the mid-word match so the accent/apostrophe cases survive", () => {
    expect(names("jawil")).toEqual(["A'ja Wilson"]); // across the boundary, tier 2
  });

  it("empty or whitespace query → nothing", () => {
    expect(names("")).toEqual([]);
    expect(names("   ")).toEqual([]);
  });

  it("'current' is the latest season on record, not the on-roster flag", () => {
    const waived = mk("Chennedy Carter", { active: false, team: null, lastYear: 2026 });
    const retiredStar = mk("Candace Parker", { active: false, lastYear: 2023 });
    const out = rankPlayers([retiredStar, waived], "c").map((p) => p.name);
    expect(out).toEqual(["Chennedy Carter", "Candace Parker"]);
  });
});
