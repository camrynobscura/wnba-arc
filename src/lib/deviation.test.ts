import { describe, it, expect } from "vitest";
import { getBaselineContext, isSmallSample, makeLeague, type League } from "./deviation";
import type { LeagueSeason, PlayerDetail, Season, SeasonPlayed } from "../data/api";

/**
 * Tests for the baseline/subject logic in deviation.ts — the pure "brain" that decides
 * which season is examined, which seasons are selectable, and which baseline window is
 * offered. Every case here maps to a product rule (CLAUDE.md → Summary view controls)
 * or to a real bug we hit: small-sample seasons being wrongly selectable, and a
 * null-subjectYear falling through to the wrong season.
 */

// A 40-game slate ⇒ small-sample threshold = 0.25 × 40 = 10 GP. Fixtures below use GP
// relative to that: 40 = a full season, single digits = small sample.
const SLATE = 40;

/** A played season with sensible stat defaults; override only what a case cares about. */
function playedSeason(year: number, gp: number, stats: Partial<SeasonPlayed> = {}): SeasonPlayed {
  return {
    year,
    played: true,
    age: 25,
    gp,
    min: 30,
    pts: 15,
    reb: 6,
    ast: 4,
    stl: 1,
    blk: 1,
    fgp: 0.45,
    tpp: 0.35,
    tsPct: 0.55,
    ...stats,
  };
}

/** A league lookup where every listed year has the same 40-game slate. */
function league(years: number[]): League {
  const seasons: LeagueSeason[] = years.map((year) => ({
    year,
    scheduledGames: SLATE,
    pts: 12,
    reb: 5,
    ast: 3,
    stl: 1,
    blk: 0.8,
    fgp: 0.43,
    tpp: 0.33,
    tsPct: 0.52,
  }));
  return makeLeague(seasons);
}

/** A player detail from a list of seasons; identity fields are filler. */
function player(seasons: Season[]): PlayerDetail {
  return {
    id: "p1",
    espn: "1",
    name: "Test Player",
    team: "LV",
    teamAbbr: "LV",
    pos: "F",
    jersey: 22,
    seasons,
  };
}

describe("getBaselineContext — subject selection & selectable seasons", () => {
  it("defaults the subject to the latest full season and lists all years newest-first", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, null, "own", "career");

    expect(ctx.subject.year).toBe(2022);
    expect(ctx.selectableYears).toEqual([2022, 2021, 2020]);
    expect(ctx.nonSelectableSmallSample).toEqual([]);
  });

  it("excludes a small-sample season from selection and surfaces it as a note", () => {
    // 2021 = 4 of 40 games ⇒ small sample; it must not be selectable as the subject.
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 4), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, null, "own", "career");

    expect(ctx.selectableYears).toEqual([2022, 2020]);
    expect(ctx.nonSelectableSmallSample.map((s) => s.year)).toEqual([2021]);
  });

  it("ignores a small-sample year passed as subjectYear and falls back to the latest full season", () => {
    // The Alyssa Thomas 2021 / Napheesa Collier 2022 bug: selecting a small-sample year
    // used to stick. It must resolve to the latest selectable (full) season instead.
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 4), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, 2021, "own", "career");

    expect(ctx.subject.year).toBe(2022);
  });

  it("honors subjectYear when it names a selectable (full) season", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, 2020, "own", "career");

    expect(ctx.subject.year).toBe(2020);
  });

  it("keeps all seasons selectable when the player has no full season (fallback)", () => {
    // Both seasons are small sample ⇒ the greying-out would leave nothing to pick, so the
    // fallback keeps them all selectable and the note stays empty.
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 3), playedSeason(2022, 5)]);

    const ctx = getBaselineContext(p, L, null, "own", "career");

    expect(ctx.selectableYears).toEqual([2022, 2021]);
    expect(ctx.nonSelectableSmallSample).toEqual([]);
    expect(ctx.subject.year).toBe(2022);
  });
});

describe("getBaselineContext — own vs. league fallback", () => {
  it("falls back to league when a first-season player has no prior history", () => {
    const L = league([2022]);
    const p = player([playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, null, "own", "career");

    expect(ctx.ownAvailable).toBe(false);
    expect(ctx.effectiveTarget).toBe("league");
    expect(ctx.fallbackActive).toBe(true);
  });

  it("keeps own when at least one prior eligible season exists", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, 2022, "own", "career");

    expect(ctx.ownAvailable).toBe(true);
    expect(ctx.effectiveTarget).toBe("own");
    expect(ctx.fallbackActive).toBe(false);
  });
});

describe("getBaselineContext — window distinctness", () => {
  // With N prior eligible seasons: last1 needs N≥1, career needs N≥2 (equals last1 at N=1),
  // last5 needs N≥6 (equals career at N≤5). See CLAUDE.md → Summary view controls.
  it("offers only last-1 with a single prior season (N=1)", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, 2022, "own", "last1");

    expect(ctx.windowAvailable).toEqual({ career: false, last5: false, last1: true });
  });

  it("offers career + last-1 (not last-5) with two prior seasons (N=2)", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, 2022, "own", "career");

    expect(ctx.windowAvailable).toEqual({ career: true, last5: false, last1: true });
  });

  it("offers all three windows once there are six prior seasons (N=6)", () => {
    const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
    const L = league(years);
    const p = player(years.map((y) => playedSeason(y, 40)));

    const ctx = getBaselineContext(p, L, 2022, "own", "last5");

    expect(ctx.windowAvailable).toEqual({ career: true, last5: true, last1: true });
  });

  it("offers career only (the subject year itself) for a first season in league mode", () => {
    const L = league([2022]);
    const p = player([playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, 2022, "league", "career");

    expect(ctx.windowAvailable).toEqual({ career: true, last5: false, last1: false });
  });
});

describe("isSmallSample — 25% boundary (shared with wnba-data)", () => {
  const L = league([2022]); // slate 40 ⇒ threshold 10 GP

  it("flags a season strictly below 25% of the slate", () => {
    expect(isSmallSample(playedSeason(2022, 9), L)).toBe(true);
  });

  it("does NOT flag a season exactly at 25% of the slate", () => {
    expect(isSmallSample(playedSeason(2022, 10), L)).toBe(false);
  });

  it("does NOT flag a season above 25% of the slate", () => {
    expect(isSmallSample(playedSeason(2022, 11), L)).toBe(false);
  });
});

describe("makeLeague — slate fallback", () => {
  it("uses the default slate for a year the league data doesn't list", () => {
    // A missing year must not throw; it falls back to DEFAULT_SCHEDULED_GAMES (40).
    const L = makeLeague([]);
    expect(L.scheduled(2022)).toBe(40);
  });
});
