import { describe, expect, it } from "vitest";
import type { PlayerSummary } from "../data/api";
import { careerSpan, joinMeta, playerMeta, positionPart } from "./playerMeta";

const summary = (over: Partial<PlayerSummary>): PlayerSummary => ({
  id: "1",
  espn: "1",
  name: "Someone",
  team: null,
  teamAbbr: null,
  pos: null,
  jersey: null,
  active: true,
  firstYear: null,
  lastYear: null,
  ...over,
});

describe("careerSpan", () => {
  it("joins the years with an en dash, or shows one year, or nothing", () => {
    expect(careerSpan({ firstYear: 1997, lastYear: 2003 })).toBe("1997–2003");
    expect(careerSpan({ firstYear: 2004, lastYear: 2004 })).toBe("2004");
    expect(careerSpan({ firstYear: null, lastYear: null })).toBeNull();
  });
});

describe("playerMeta", () => {
  it("an active player: team · position · number, and only the parts that exist", () => {
    const wilson = summary({ team: "Las Vegas Aces", teamAbbr: "LV", pos: "C", jersey: 22, firstYear: 2018, lastYear: 2026 });
    expect(playerMeta(wilson, true)).toEqual({ shown: "Las Vegas Aces · C · #22", spoken: "Las Vegas Aces, center, #22" });
    expect(playerMeta(wilson).shown).toBe("Las Vegas Aces · C"); // search rows carry no number
    // Off-roster (international duty): no team, no dangling separator.
    expect(playerMeta(summary({ pos: "G", jersey: 12 }), true)).toEqual({ shown: "G · #12", spoken: "guard, #12" });
  });

  it("an off-roster player: the career span stands in for the team, position only if known — and NO 'Retired'", () => {
    const taurasi = summary({ active: false, pos: "G", jersey: 3, firstYear: 2004, lastYear: 2024 });
    expect(playerMeta(taurasi, true)).toEqual({ shown: "2004–2024 · G", spoken: "2004–2024, guard" }); // no number: it's their last, not theirs
    const cooper = summary({ active: false, firstYear: 1997, lastYear: 2003 }); // no position on record
    expect(playerMeta(cooper, true)).toEqual({ shown: "1997–2003", spoken: "1997–2003" });
    // ESPN's `active` is an on-a-roster flag, not a retirement record: a player waived mid-2026 is
    // inactive with a 2026 season. The line must not call them retired.
    const waived = summary({ active: false, pos: "G", firstYear: 2020, lastYear: 2026 });
    expect(playerMeta(waived, true).shown).toBe("2020–2026 · G");
    expect(Object.values(playerMeta(waived, true)).join(" ")).not.toMatch(/retired/i);
    expect(playerMeta(summary({ active: false }))).toEqual({ shown: "", spoken: "" });
  });
});

describe("the spoken line", () => {
  it("speaks the position as its word, and an unknown code as written", () => {
    expect(positionPart("F")).toEqual({ shown: "F", spoken: "forward" });
    expect(positionPart("X")).toEqual({ shown: "X", spoken: "X" });
    expect(positionPart(null)).toBeNull();
  });

  it("puts commas where the dots are, and drops a missing part with its separator both ways", () => {
    // The featured list's line: team + position, no number.
    expect(joinMeta(["Chicago Sky", positionPart("C")])).toEqual({ shown: "Chicago Sky · C", spoken: "Chicago Sky, center" });
    expect(joinMeta([null, positionPart("G"), null])).toEqual({ shown: "G", spoken: "guard" });
    expect(joinMeta(["Chicago Sky", null])).toEqual({ shown: "Chicago Sky", spoken: "Chicago Sky" });
  });
});
