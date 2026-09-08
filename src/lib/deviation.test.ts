import { describe, it, expect } from "vitest";
import {
  buildHeatmapGrid,
  buildStatDetail,
  cellPercentile,
  getBaselineContext,
  getBaselineValue,
  isSmallSample,
  isStatSmallSample,
  makeLeague,
  makePositionLookup,
  ordinal,
  ownStatAverage,
  positionNoun,
  type HeatmapCell,
  type HeatmapGrid,
  type League,
  type PositionLookup,
} from "./deviation";
import { STATS } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, Season, SeasonPlayed } from "../data/api";

/**
 * Tests for the baseline/subject logic in deviation.ts — the pure "brain" that decides which
 * season is examined, which seasons are selectable, and how a season compares to that year's
 * league or position peers. The "own history" baseline and the Window control were removed
 * (the Career Trend heatmap tells the own-trajectory story); every comparison here is a season
 * vs. that same year's crowd.
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
    // Makes/attempts consistent with fgp/tpp (90/200 = .45, 35/100 = .35) and well above the
    // 10-attempt gate, so a default fixture season is a normal (not attempt-thin) sample.
    fgMade: 90,
    fgAtt: 200,
    fg3Made: 35,
    fg3Att: 100,
    tsPct: 0.55,
    ...stats,
  };
}

/** An evenly-spaced decile ladder [0 … max] (11 values), for percentile-interpolation tests. */
const ladder = (max: number): number[] => Array.from({ length: 11 }, (_, i) => (i / 10) * max);

/** A league lookup where every listed year has the same 40-game slate. Spread + decile ladders
    are uniform across years so a step-bar/percentile test can predict them: pts step = 5, and
    the pts ladder runs 0→40 (so pts 18 → 45th percentile). */
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
    stdev: { pts: 5, reb: 2, ast: 1.5, stl: 0.4, blk: 0.4 },
    pctiles: { pts: ladder(40), reb: ladder(12), ast: ladder(9), stl: ladder(2.4), blk: ladder(2.3) },
  }));
  return makeLeague(seasons);
}

/** A player detail from a list of seasons; identity fields are filler. `pos` defaults to F. */
function player(seasons: Season[], pos: string | null = "F"): PlayerDetail {
  return {
    id: "p1",
    espn: "1",
    name: "Test Player",
    team: "LV",
    teamAbbr: "LV",
    pos,
    jersey: 22,
    seasons,
  };
}

/** A position lookup with G/F/C rows for the given years (uniform per-position values). */
function positions(years: number[]): PositionLookup {
  const rows: PositionSeason[] = [];
  for (const year of years) {
    // Distinct per-position pts so a test can tell which bucket was read. Centers get a pts step
    // of 4 (≠ the league's 5) and a pts ladder 0→20 (so a center with pts 16 → 80th percentile),
    // so a position-mode test can prove it used the POSITION's spread, not the league's.
    rows.push({ year, position: "G", pts: 15, reb: 3, ast: 5, stl: 1, blk: 0.3, fgp: 0.43, tpp: 0.36, tsPct: 0.54,
      stdev: { pts: 5, reb: 1.5, ast: 2, stl: 0.5, blk: 0.2 }, pctiles: { pts: ladder(30), reb: ladder(6), ast: ladder(10), stl: ladder(2), blk: ladder(1) } });
    rows.push({ year, position: "F", pts: 12, reb: 5, ast: 2, stl: 1, blk: 0.7, fgp: 0.46, tpp: 0.34, tsPct: 0.56,
      stdev: { pts: 4.5, reb: 2, ast: 1.2, stl: 0.4, blk: 0.4 }, pctiles: { pts: ladder(28), reb: ladder(12), ast: ladder(5), stl: ladder(2.2), blk: ladder(2) } });
    rows.push({ year, position: "C", pts: 10, reb: 7, ast: 1, stl: 0.7, blk: 1.5, fgp: 0.52, tpp: 0.2, tsPct: 0.58,
      stdev: { pts: 4, reb: 2.5, ast: 1, stl: 0.3, blk: 0.6 }, pctiles: { pts: ladder(20), reb: ladder(14), ast: ladder(4), stl: ladder(1.5), blk: ladder(3) } });
  }
  return makePositionLookup(rows);
}

/** Empty position lookup for the league-only tests that don't exercise position mode. */
const POS = makePositionLookup([]);

describe("getBaselineContext — subject selection & selectable seasons", () => {
  it("defaults the subject to the latest full season and lists all years newest-first", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, POS, null, "league");

    expect(ctx.subject.year).toBe(2022);
    expect(ctx.selectableYears).toEqual([2022, 2021, 2020]);
    expect(ctx.nonSelectableSmallSample).toEqual([]);
  });

  it("excludes a small-sample season from selection and surfaces it as a note", () => {
    // 2021 = 4 of 40 games ⇒ small sample; it must not be selectable as the subject.
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 4), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, POS, null, "league");

    expect(ctx.selectableYears).toEqual([2022, 2020]);
    expect(ctx.nonSelectableSmallSample.map((s) => s.year)).toEqual([2021]);
  });

  it("ignores a small-sample year passed as subjectYear and falls back to the latest full season", () => {
    // The Alyssa Thomas 2021 / Napheesa Collier 2022 bug: selecting a small-sample year
    // used to stick. It must resolve to the latest selectable (full) season instead.
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 4), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, POS, 2021, "league");

    expect(ctx.subject.year).toBe(2022);
  });

  it("honors subjectYear when it names a selectable (full) season", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 40), playedSeason(2022, 40)]);

    const ctx = getBaselineContext(p, L, POS, 2020, "league");

    expect(ctx.subject.year).toBe(2020);
  });

  it("keeps all seasons selectable when the player has no full season (fallback)", () => {
    // Both seasons are small sample ⇒ the greying-out would leave nothing to pick, so the
    // fallback keeps them all selectable and the note stays empty.
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 3), playedSeason(2022, 5)]);

    const ctx = getBaselineContext(p, L, POS, null, "league");

    expect(ctx.selectableYears).toEqual([2022, 2021]);
    expect(ctx.nonSelectableSmallSample).toEqual([]);
    expect(ctx.subject.year).toBe(2022);
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

describe("getBaselineContext — position baseline", () => {
  it("offers position mode when the position is known and /positions is loaded", () => {
    const L = league([2022, 2023, 2024]);
    const P = positions([2022, 2023, 2024]);
    const p = player([playedSeason(2022, 40), playedSeason(2023, 40), playedSeason(2024, 40)], "C");

    const ctx = getBaselineContext(p, L, P, 2024, "position");

    expect(ctx.positionAvailable).toBe(true);
    expect(ctx.target).toBe("position");
    expect(ctx.playerPosition).toBe("C");
    expect(ctx.positionSampleMissing).toBe(false);
  });

  it("does NOT offer position mode when /positions hasn't loaded (null lookup)", () => {
    const L = league([2024]);
    const p = player([playedSeason(2024, 40)], "C");

    const ctx = getBaselineContext(p, L, null, 2024, "league");

    expect(ctx.positionAvailable).toBe(false);
  });

  it("does NOT offer position mode when the player's position is unknown", () => {
    const L = league([2024]);
    const p = player([playedSeason(2024, 40)], null);

    const ctx = getBaselineContext(p, L, positions([2024]), 2024, "league");

    expect(ctx.positionAvailable).toBe(false);
    expect(ctx.playerPosition).toBeNull();
  });

  it("reads the player's OWN position bucket for the baseline value", () => {
    // Fixture pts: centers = 10, guards = 15. A center must baseline against 10.
    const L = league([2024]);
    const p = player([playedSeason(2024, 40, { pts: 20 })], "C");

    const ctx = getBaselineContext(p, L, positions([2024]), 2024, "position");

    expect(getBaselineValue("pts", ctx)).toBe(10);
  });

  it("flags positionSampleMissing (and returns null) when the subject year has no same-position row", () => {
    // /positions only has 2024; the subject 2022 has no bucket → no same-position sample.
    const L = league([2022, 2024]);
    const p = player([playedSeason(2022, 40), playedSeason(2024, 40)], "C");

    const ctx = getBaselineContext(p, L, positions([2024]), 2022, "position");

    expect(ctx.positionSampleMissing).toBe(true);
    expect(getBaselineValue("pts", ctx)).toBeNull();
  });

  it("does NOT fall back to league in position mode (a first-season player still compares to peers)", () => {
    const L = league([2024]);
    const p = player([playedSeason(2024, 40)], "G");

    const ctx = getBaselineContext(p, L, positions([2024]), 2024, "position");

    expect(ctx.target).toBe("position");
    expect(ctx.positionSampleMissing).toBe(false);
  });
});

describe("positionNoun", () => {
  it("maps position codes to plural nouns", () => {
    expect(positionNoun("G")).toBe("guards");
    expect(positionNoun("F")).toBe("forwards");
    expect(positionNoun("C")).toBe("centers");
  });

  it("falls back for an unknown or missing position", () => {
    expect(positionNoun(null)).toBe("players at the same position");
    expect(positionNoun("X")).toBe("players at the same position");
  });
});

describe("ownStatAverage — pooled rate averages (still used by the Career Trend heatmap)", () => {
  it("pools a shooting % from summed makes/attempts, not a mean of season percentages", () => {
    // A 1-of-1 (100%) season next to real-volume seasons. A naive mean of the season
    // percentages reads ~61%; pooling reads 40/101 ≈ 39.6% — the 1-attempt season contributes
    // 1 make to a 101-attempt pool, which is what one shot should be worth.
    const seasons = [
      playedSeason(2021, 40, { fg3Made: 1, fg3Att: 1 }), // 100%
      playedSeason(2022, 40, { fg3Made: 30, fg3Att: 80 }), // 37.5%
      playedSeason(2023, 40, { fg3Made: 9, fg3Att: 20 }), // 45%
    ];
    const pooled = ownStatAverage("tpp", seasons);
    expect(pooled).toBeCloseTo(40 / 101, 5); // ≈ 0.396
    expect(pooled!).toBeLessThan(0.5);
  });

  it("returns null for a rate stat when there were zero attempts", () => {
    expect(ownStatAverage("tpp", [playedSeason(2021, 40, { fg3Made: 0, fg3Att: 0 })])).toBeNull();
  });

  it("still means counting stats per-game (behavior unchanged for non-rate stats)", () => {
    const seasons = [playedSeason(2021, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 20 })];
    expect(ownStatAverage("pts", seasons)).toBe(15);
  });
});

describe("isStatSmallSample — per-stat gate (games OR attempts)", () => {
  const L = league([2021]);

  it("flags a full-games season as small sample for a shooting % with too few attempts", () => {
    const s = playedSeason(2021, 40, { fg3Made: 1, fg3Att: 1 }); // full games, 1 three
    expect(isSmallSample(s, L)).toBe(false); // games gate: a full season
    expect(isStatSmallSample(s, L, "tpp")).toBe(true); // attempt gate: too few threes
    expect(isStatSmallSample(s, L, "pts")).toBe(false); // counting stat has no attempt gate
  });

  it("does not flag a full-games season that has enough attempts", () => {
    expect(isStatSmallSample(playedSeason(2021, 40, { fg3Att: 60, fg3Made: 20 }), L, "tpp")).toBe(false);
  });

  it("boundary: fewer than 10 attempts is small, exactly 10 is not", () => {
    expect(isStatSmallSample(playedSeason(2021, 40, { fg3Att: 9, fg3Made: 3 }), L, "tpp")).toBe(true);
    expect(isStatSmallSample(playedSeason(2021, 40, { fg3Att: 10, fg3Made: 3 }), L, "tpp")).toBe(false);
  });

  it("still flags a games-small season regardless of how many attempts it had", () => {
    const s = playedSeason(2021, 3, { fg3Att: 200, fg3Made: 80 }); // few games, lots of threes
    expect(isStatSmallSample(s, L, "tpp")).toBe(true);
  });
});

describe("buildHeatmapGrid — the switchable-reference heatmap", () => {
  const cell = (g: HeatmapGrid, year: number, key: string): HeatmapCell =>
    g.rows[g.years.indexOf(year)].find((c) => c.statKey === key)!;

  it("lays out rows newest-first, one per season × every stat", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([playedSeason(2020, 40), playedSeason(2021, 40), playedSeason(2022, 40)]);
    const g = buildHeatmapGrid(p, "league", L, POS, "F");
    expect(g.years).toEqual([2022, 2021, 2020]);
    expect(g.rows).toHaveLength(3);
    expect(g.rows[0]).toHaveLength(STATS.length);
  });

  it("self mode: colors each season vs the player's own career average, self-scaled", () => {
    // pts 10 & 20 → career avg 15, own range 5 (floor 0.5×league-step 5 = 2.5, so 5 wins).
    // 2020 (10) → (10−15)/5 = −1 ; 2022 (20) → +1. Deltas −5 / +5.
    const L = league([2020, 2022]);
    const p = player([playedSeason(2020, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 20 })]);
    const g = buildHeatmapGrid(p, "self", L, POS, "F");
    expect(cell(g, 2022, "pts").colorT).toBeCloseTo(1, 5);
    expect(cell(g, 2022, "pts").delta).toBeCloseTo(5, 5);
    expect(cell(g, 2020, "pts").colorT).toBeCloseTo(-1, 5);
    expect(cell(g, 2020, "pts").delta).toBeCloseTo(-5, 5);
  });

  it("league mode: colors in z-score steps vs THAT year's league (same ruler as the old bars)", () => {
    // pts 18 vs league 12, step 5 → 1.2 steps → 1.2/3 = 0.4 colorT. Delta +6.
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { pts: 18 })]);
    const g = buildHeatmapGrid(p, "league", L, POS, "F");
    expect(cell(g, 2022, "pts").colorT).toBeCloseTo(0.4, 5);
    expect(cell(g, 2022, "pts").delta).toBeCloseTo(6, 5);
    expect(cell(g, 2022, "pts").up).toBe(true);
  });

  it("position mode: colors against the POSITION's own average + spread", () => {
    // Center pts 16 vs center avg 10, center step 4 → 1.5 steps → 0.5 colorT. Delta +6.
    const L = league([2024]);
    const P = positions([2024]);
    const p = player([playedSeason(2024, 40, { pts: 16 })], "C");
    const g = buildHeatmapGrid(p, "position", L, P, "C");
    expect(cell(g, 2024, "pts").colorT).toBeCloseTo(0.5, 5);
    expect(cell(g, 2024, "pts").delta).toBeCloseTo(6, 5);
  });

  it("shooting %s fall back to a relative-% gap in peer modes (no spread)", () => {
    // tpp .44 vs league .33 → relative .333 → .333/.5 = .667 colorT; delta +11 pp.
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { tpp: 0.44 })]);
    const g = buildHeatmapGrid(p, "league", L, POS, "F");
    expect(cell(g, 2022, "tpp").colorT).toBeCloseTo(0.6667, 3);
    expect(cell(g, 2022, "tpp").deltaFmt).toBe("+11.0 pp");
  });

  it("peer mode falls back to relative-% color when the league spread is absent (pre-004 data)", () => {
    const Lnull = makeLeague([
      { year: 2022, scheduledGames: SLATE, pts: 12, reb: 5, ast: 3, stl: 1, blk: 0.8, fgp: 0.43, tpp: 0.33, tsPct: 0.52, stdev: null, pctiles: null },
    ]);
    const p = player([playedSeason(2022, 40, { pts: 18 })]);
    const c = cell(buildHeatmapGrid(p, "league", Lnull, POS, "F"), 2022, "pts");
    expect(c.colorT).toBeCloseTo(1, 5); // relative (18−12)/12 = 0.5 → 0.5/0.5 = full
    expect(c.delta).toBeCloseTo(6, 5);
  });

  it("missed seasons are gaps: no color, no value, not clickable", () => {
    const L = league([2021, 2022]);
    const p = player([{ year: 2021, played: false, reason: "did not play" }, playedSeason(2022, 40)]);
    const c = cell(buildHeatmapGrid(p, "league", L, POS, "F"), 2021, "pts");
    expect(c.played).toBe(false);
    expect(c.colorT).toBeNull();
    expect(c.valueFmt).toBe("—");
    expect(c.selectable).toBe(false);
  });

  it("small-sample cells are greyed (no color/delta) and not clickable", () => {
    // A full-games season but 1-of-1 threes → tpp is attempt-thin.
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { fg3Made: 1, fg3Att: 1 })]);
    const c = cell(buildHeatmapGrid(p, "league", L, POS, "F"), 2022, "tpp");
    expect(c.smallSample).toBe(true);
    expect(c.colorT).toBeNull();
    expect(c.delta).toBeNull();
    expect(c.selectable).toBe(false);
  });

  it("position mode with no bucket that year: no color, but the cell still opens the drill-down", () => {
    // /positions has only 2024; the 2022 center row has no bucket → neutral, but selectable.
    const L = league([2022, 2024]);
    const p = player([playedSeason(2022, 40, { pts: 20 }), playedSeason(2024, 40, { pts: 20 })], "C");
    const c = cell(buildHeatmapGrid(p, "position", L, positions([2024]), "C"), 2022, "pts");
    expect(c.colorT).toBeNull();
    expect(c.delta).toBeNull();
    expect(c.value).toBe(20);
    expect(c.selectable).toBe(true);
  });
});

describe("cellPercentile — the reveal strip's rank (peer modes, counting stats only)", () => {
  const cell = (g: HeatmapGrid, year: number, key: string): HeatmapCell =>
    g.rows[g.years.indexOf(year)].find((c) => c.statKey === key)!;

  it("league mode: ranks a counting stat on THAT year's league ladder", () => {
    // pts 18 on the fixture's 0→40 league ladder → 45th (same answer as the drill-down's Pct column).
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { pts: 18 })]);
    const g = buildHeatmapGrid(p, "league", L, POS, "F");
    expect(cellPercentile(cell(g, 2022, "pts"), "league", L, POS, "F")).toBeCloseTo(45, 5);
  });

  it("position mode: uses the POSITION's own ladder, not the league's", () => {
    // Center pts 16 on the center 0→20 ladder → 80th (the league's 0→40 ladder would say 40th).
    const L = league([2024]);
    const P = positions([2024]);
    const p = player([playedSeason(2024, 40, { pts: 16 })], "C");
    const g = buildHeatmapGrid(p, "position", L, P, "C");
    expect(cellPercentile(cell(g, 2024, "pts"), "position", L, P, "C")).toBeCloseTo(80, 5);
  });

  it("is null in self mode — 'vs their own career' has no population to rank within", () => {
    const L = league([2020, 2022]);
    const p = player([playedSeason(2020, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 20 })]);
    const g = buildHeatmapGrid(p, "self", L, POS, "F");
    expect(cellPercentile(cell(g, 2022, "pts"), "self", L, POS, "F")).toBeNull();
  });

  it("is null for a shooting % (no ladder)", () => {
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { tpp: 0.44 })]);
    const g = buildHeatmapGrid(p, "league", L, POS, "F");
    expect(cellPercentile(cell(g, 2022, "tpp"), "league", L, POS, "F")).toBeNull();
  });

  it("is null for a small-sample cell", () => {
    // 3 of 40 games → the cell is greyed/not compared, so it gets no rank either.
    const L = league([2022]);
    const p = player([playedSeason(2022, 3, { pts: 18 })]);
    const g = buildHeatmapGrid(p, "league", L, POS, "F");
    expect(cellPercentile(cell(g, 2022, "pts"), "league", L, POS, "F")).toBeNull();
  });

  it("is null in position mode when that year has no same-position bucket", () => {
    // /positions has only 2024; the 2022 season has no center bucket → no rank.
    const L = league([2022, 2024]);
    const P = positions([2024]);
    const p = player([playedSeason(2022, 40, { pts: 20 }), playedSeason(2024, 40, { pts: 20 })], "C");
    const g = buildHeatmapGrid(p, "position", L, P, "C");
    expect(cellPercentile(cell(g, 2022, "pts"), "position", L, P, "C")).toBeNull();
  });
});

describe("ordinal", () => {
  it("handles 1/2/3 endings and the teens", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(94)).toBe("94th");
    expect(ordinal(100)).toBe("100th");
    expect(ordinal(111)).toBe("111th");
  });
});

describe("buildStatDetail — per-season percentile (table 'Pct' column)", () => {
  const ptsStat = STATS.find((s) => s.key === "pts")!;
  const tppStat = STATS.find((s) => s.key === "tpp")!;
  const rowPctile = (detail: ReturnType<typeof buildStatDetail>, year: number) =>
    detail.tableRows.find((r) => r.year === year)!.pctile;

  it("computes the league percentile of each season for a counting stat", () => {
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { pts: 18 })]);
    const detail = buildStatDetail(p, ptsStat, getBaselineContext(p, L, POS, 2022, "league"));
    expect(rowPctile(detail, 2022)).toBeCloseTo(45, 5); // pts 18 on the 0→40 ladder → 45th
  });

  it("uses the position's own ladder in position mode", () => {
    const L = league([2024]);
    const P = positions([2024]);
    const p = player([playedSeason(2024, 40, { pts: 16 })], "C");
    const detail = buildStatDetail(p, ptsStat, getBaselineContext(p, L, P, 2024, "position"));
    expect(rowPctile(detail, 2024)).toBeCloseTo(80, 5); // pts 16 on the center 0→20 ladder → 80th
  });

  it("leaves shooting-% rows without a percentile (no ladder → column hidden)", () => {
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { tpp: 0.44 })]);
    const detail = buildStatDetail(p, tppStat, getBaselineContext(p, L, POS, 2022, "league"));
    expect(detail.tableRows.every((r) => r.pctile === null)).toBe(true);
  });

  it("has no percentile on a small-sample or missed season", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 3, { pts: 18 }), playedSeason(2022, 40, { pts: 18 })]);
    const detail = buildStatDetail(p, ptsStat, getBaselineContext(p, L, POS, 2022, "league"));
    expect(rowPctile(detail, 2021)).toBeNull(); // 3 of 40 games → small sample
    expect(rowPctile(detail, 2022)).toBeCloseTo(45, 5);
  });
});

describe("buildStatDetail — chart drops thin seasons; table keeps the full record", () => {
  const tppStat = STATS.find((s) => s.key === "tpp")!;
  const ptsStat = STATS.find((s) => s.key === "pts")!;

  it("charts only trustworthy seasons but lists every season (with makes/attempts) in the table", () => {
    const L = league([2019, 2020, 2021, 2022]);
    const seasons: Season[] = [
      { year: 2019, played: false, reason: "did not play" },
      playedSeason(2020, 40, { fg3Made: 30, fg3Att: 80 }), // 37.5% — charted
      playedSeason(2021, 40, { fg3Made: 1, fg3Att: 1 }), // 100% on 1 attempt — dropped from chart
      playedSeason(2022, 40, { fg3Made: 9, fg3Att: 20 }), // 45% — charted (subject)
    ];
    const p = player(seasons);
    const ctx = getBaselineContext(p, L, POS, 2022, "league");
    const detail = buildStatDetail(p, tppStat, ctx);

    // Chart: only the two ≥10-attempt seasons. DNP + attempt-thin are gone entirely.
    expect(detail.bars.map((b) => b.year)).toEqual([2020, 2022]);
    expect(detail.chartFallback).toBeNull();
    // Every charted season now has a league baseline that year (no more first-season gap).
    expect(detail.bars.find((b) => b.year === 2020)!.baseFmt).toBeDefined();
    expect(detail.bars.find((b) => b.year === 2022)!.baseFmt).toBeDefined();

    // Table: every season, newest-first, with 3PM/3PA and the thin row flagged + delta hidden.
    expect(detail.tableRows.map((r) => r.year)).toEqual([2022, 2021, 2020, 2019]);
    const thin = detail.tableRows.find((r) => r.year === 2021)!;
    expect(thin.smallSample).toBe(true);
    expect(thin.made).toBe(1);
    expect(thin.att).toBe(1);
    expect(thin.deltaFmt).toBe("—"); // delta suppressed for a noise season
    expect(detail.component).toEqual({ madeShort: "3PM", attShort: "3PA", noun: "three-pointers" });
  });

  it("counting stats have no makes/attempts columns", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40), playedSeason(2022, 40)]);
    const detail = buildStatDetail(p, ptsStat, getBaselineContext(p, L, POS, 2022, "league"));
    expect(detail.component).toBeNull();
    expect(detail.tableRows.every((r) => r.made === null && r.att === null)).toBe(true);
  });

  it("shows the fallback line and flags the subject when the stat is too thin to chart", () => {
    // A near-non-shooter (Alyssa Thomas-style): every season under 10 threes → nothing chartable.
    const L = league([2020, 2021, 2022]);
    const p = player([
      playedSeason(2020, 40, { fg3Made: 0, fg3Att: 2 }),
      playedSeason(2021, 40, { fg3Made: 1, fg3Att: 3 }),
      playedSeason(2022, 40, { fg3Made: 2, fg3Att: 5 }),
    ]);
    const detail = buildStatDetail(p, tppStat, getBaselineContext(p, L, POS, 2022, "league"));
    expect(detail.bars).toHaveLength(0);
    expect(detail.chartFallback).toMatch(/enough three-point attempts/i);
    expect(detail.subjectSmallSample).toBe(true);
  });
});
