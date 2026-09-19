import { describe, it, expect } from "vitest";
import {
  aboveLabel,
  buildHeatmapGrid,
  buildStatDetail,
  cellPercentile,
  fmtCell,
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
 * Tests for the comparison logic in deviation.ts — the pure "brain" behind the heatmap and the
 * drill-down: which seasons count, what each season is measured against (their career, the
 * league, or their position that year), and the drill-down's chart, table, and career summary.
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
    pool: null,
    rank: null,
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

describe("fmtCell — the glance form drawn in a heatmap cell", () => {
  it("rounds shooting %s to a whole percent, up or down", () => {
    expect(fmtCell(0.519, true)).toBe("52%");
    expect(fmtCell(0.514, true)).toBe("51%");
    expect(fmtCell(0.515, true)).toBe("52%"); // .5 rounds up
    expect(fmtCell(0.29, true)).toBe("29%"); // 0.29 × 100 is 28.999… in floating point
    expect(fmtCell(1, true)).toBe("100%");
    expect(fmtCell(0, true)).toBe("0%");
  });
  it("keeps the tenth on counting stats — a 0.4 block must not read as nothing", () => {
    expect(fmtCell(0.4, false)).toBe("0.4");
    expect(fmtCell(26.94, false)).toBe("26.9");
  });
  it("is a dash for no value", () => {
    expect(fmtCell(null, true)).toBe("—");
    expect(fmtCell(undefined, false)).toBe("—");
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
    expect(cell(g, 2022, "pts").refValue).toBe(15); // the career avg of 10 & 20 — shown in the popover
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
    expect(cell(g, 2022, "pts").refValue).toBe(12); // that year's league avg — shown in the popover
    expect(cell(g, 2022, "pts").cellFmt).toBe("18.0"); // counting stats keep their tenth in the cell
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
    // The cell draws the rounded glance form; the popover / accessible name keep the exact value.
    expect(cell(g, 2022, "tpp").cellFmt).toBe("44%");
    expect(cell(g, 2022, "tpp").valueFmt).toBe("44.0%");
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
    expect(c.cellFmt).toBe("—");
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

describe("buildStatDetail — the reference follows the page's mode", () => {
  const pts = STATS.find((s) => s.key === "pts")!;
  const bar = (d: ReturnType<typeof buildStatDetail>, year: number) => d.bars.find((b) => b.year === year)!;
  const row = (d: ReturnType<typeof buildStatDetail>, year: number) => d.tableRows.find((r) => r.year === year)!;

  it("league mode: each season vs THAT year's league average, with its percentile", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 18 })]);
    const d = buildStatDetail(p, pts, "league", L, POS, "F");
    expect(bar(d, 2022).baseFmt).toBe("12.0");
    expect(bar(d, 2022).up).toBe(true);
    expect(bar(d, 2021).up).toBe(false);
    expect(row(d, 2022).deltaFmt).toBe("+6.0");
    expect(row(d, 2022).pctile).toBeCloseTo(45, 5); // pts 18 on the 0→40 ladder
    expect(d.caption).toBe("Each season below is measured against the league average for that year.");
  });

  it("self mode: a FLAT career-average reference (the heatmap's own basis), no percentile, no band", () => {
    // pts 10 and 20 → career avg 15 → 2020 below, 2022 above; the same 15 the heatmap colors by.
    const L = league([2020, 2022]);
    const p = player([playedSeason(2020, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 20 })]);
    const d = buildStatDetail(p, pts, "self", L, POS, "F");
    expect(bar(d, 2020).baseFmt).toBe("15.0");
    expect(bar(d, 2022).baseFmt).toBe("15.0");
    expect(bar(d, 2020).up).toBe(false);
    expect(bar(d, 2022).up).toBe(true);
    expect(d.tableRows.every((r) => r.pctile === null)).toBe(true);
    expect(d.hasBand).toBe(false);
    expect(d.caption).toBe("Each season below is measured against Test's career average.");
    expect(d.summary?.careerAvg).toBe("15.0");
  });

  it("position mode: the player's OWN bucket, its ladder, and a note for years with no bucket", () => {
    // /positions has only 2024; the 2022 center row has no bucket → no reference, neutral dot, note.
    const L = league([2022, 2024]);
    const p = player([playedSeason(2022, 40, { pts: 16 }), playedSeason(2024, 40, { pts: 16 })], "C");
    const d = buildStatDetail(p, pts, "position", L, positions([2024]), "C");
    expect(bar(d, 2024).baseFmt).toBe("10.0"); // centers = 10 (guards 15, league 12)
    expect(row(d, 2024).pctile).toBeCloseTo(80, 5); // pts 16 on the center 0→20 ladder
    expect(bar(d, 2022).baseFmt).toBeNull();
    expect(bar(d, 2022).up).toBeNull();
    expect(d.positionNote).toMatch(/No same-position average for 2022/);
    expect(d.caption).toBe("Each season below is measured against the average for centers that year.");
  });

  it("never falls back to league in position mode when the lookup is missing (reference stays null)", () => {
    const L = league([2024]);
    const p = player([playedSeason(2024, 40)], "G");
    const d = buildStatDetail(p, pts, "position", L, null, "G");
    expect(d.bars[0].baseFmt).toBeNull();
    expect(d.summary?.above).toBeNull();
  });
});

describe("buildStatDetail — the band behind the chart", () => {
  const pts = STATS.find((s) => s.key === "pts")!;
  const tpp = STATS.find((s) => s.key === "tpp")!;

  it("peer modes draw the 10th / median / 90th of that year's ladder, scaled with the values", () => {
    // Ladder 0→40: 10th = 4, median = 20, 90th = 36. Max of (values, refs, band tops) = 36 × 1.2.
    const L = league([2022]);
    const p = player([playedSeason(2022, 40, { pts: 18 }), playedSeason(2021, 40, { pts: 18 })]);
    const d = buildStatDetail(p, pts, "league", league([2021, 2022]), POS, "F");
    const b = d.bars.find((x) => x.year === 2022)!.band!;
    const maxVal = 36 * 1.2;
    expect(b.loPct).toBeCloseTo((4 / maxVal) * 100, 1);
    expect(b.midPct).toBeCloseTo((20 / maxVal) * 100, 1);
    expect(b.hiPct).toBeCloseTo((36 / maxVal) * 100, 1);
    expect(d.hasBand).toBe(true);
    void L;
  });

  it("shooting %s have no band (no ladder)", () => {
    const p = player([playedSeason(2021, 40), playedSeason(2022, 40)]);
    const d = buildStatDetail(p, tpp, "league", league([2021, 2022]), POS, "F");
    expect(d.bars.every((b) => b.band === null)).toBe(true);
    expect(d.hasBand).toBe(false);
  });
});

describe("buildStatDetail — career summary plates", () => {
  const pts = STATS.find((s) => s.key === "pts")!;
  const tpp = STATS.find((s) => s.key === "tpp")!;
  const rk = (pts: number, pool: number) => ({ rank: { pts, reb: 50, ast: 50, stl: 50, blk: 50 }, pool });

  it("high / low / career avg / above-reference count / best rank, over full seasons only", () => {
    const L = league([2019, 2020, 2021, 2022]);
    const p = player([
      playedSeason(2019, 40, { pts: 8, ...rk(60, 70) }),
      playedSeason(2020, 4, { pts: 30, ...rk(1, 80) }), // small sample: ignored everywhere
      playedSeason(2021, 40, { pts: 14, ...rk(20, 90) }),
      playedSeason(2022, 40, { pts: 20, ...rk(3, 100) }),
    ]);
    const s = buildStatDetail(p, pts, "league", L, POS, "F").summary!;
    expect(s.seasons).toBe(3);
    expect(s.high).toEqual({ fmt: "20.0", year: 2022 });
    expect(s.low).toEqual({ fmt: "8.0", year: 2019 });
    expect(s.careerAvg).toBe("14.0"); // mean of 8, 14, 20 — the 4-game season excluded
    expect(s.above).toEqual({ n: 2, of: 3 }); // league avg 12: 14 and 20 above, 8 below
    expect(s.bestRank).toEqual({ rank: 3, pool: 100, year: 2022 }); // the 1st-of-80 was a small sample
  });

  it("a tied best rank goes to the larger pool, then the later year", () => {
    const L = league([2018, 2025, 2026]);
    const p = player([
      playedSeason(2018, 40, { ...rk(1, 65) }),
      playedSeason(2025, 40, { ...rk(1, 158) }),
      playedSeason(2026, 40, { ...rk(1, 158) }),
    ]);
    expect(buildStatDetail(p, pts, "league", L, POS, "F").summary!.bestRank).toEqual({ rank: 1, pool: 158, year: 2026 });
  });

  it("shooting %s have no rank plate and whole-percent plate numbers; no full season → no summary", () => {
    const L = league([2021, 2022]);
    // tpp is read from the season (the fixture default is .35), so set it to match the makes/attempts.
    const p = player([playedSeason(2021, 40, { tpp: 0.35, fg3Made: 35, fg3Att: 100 }), playedSeason(2022, 40, { tpp: 0.44, fg3Made: 44, fg3Att: 100 })]);
    const s = buildStatDetail(p, tpp, "league", L, POS, "F").summary!;
    expect(s.bestRank).toBeNull();
    expect(s.high).toEqual({ fmt: "44", year: 2022 }); // 44.0% → "44" (the plate adds the sign)
    expect(s.careerAvg).toBe("40"); // pooled 79/200 = 39.5% → rounds to 40
    const thin = player([playedSeason(2022, 3)]);
    expect(buildStatDetail(thin, pts, "league", L, POS, "F").summary).toBeNull();
  });

  it("labels the above-reference plate by mode, in at most 12 characters", () => {
    expect(aboveLabel("league")).toBe("Above league");
    expect(aboveLabel("position")).toBe("Above peers");
    expect(aboveLabel("self")).toBe("Above career");
    for (const m of ["league", "position", "self"] as const) expect(aboveLabel(m).length).toBeLessThanOrEqual(12);
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
      playedSeason(2022, 40, { fg3Made: 9, fg3Att: 20 }), // 45% — charted
    ];
    const detail = buildStatDetail(player(seasons), tppStat, "league", L, POS, "F");
    expect(detail.bars.map((b) => b.year)).toEqual([2020, 2022]);
    expect(detail.chartFallback).toBeNull();
    expect(detail.bars.every((b) => b.baseFmt != null)).toBe(true);
    expect(detail.tableRows.map((r) => r.year)).toEqual([2022, 2021, 2020, 2019]);
    const thin = detail.tableRows.find((r) => r.year === 2021)!;
    expect(thin.smallSample).toBe(true);
    expect(thin.made).toBe(1);
    expect(thin.att).toBe(1);
    expect(thin.deltaFmt).toBe("—"); // delta suppressed for a noise season
    expect(detail.component).toEqual({ madeShort: "3PM", attShort: "3PA", noun: "three-pointers" });
    expect(detail.unit).toBe("%"); // the sign is the word after a whole-percent plate number
  });

  it("counting stats have no makes/attempts columns; the rank column reads the API's rank + pool", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40), playedSeason(2022, 40, { rank: { pts: 9, reb: 1, ast: 1, stl: 1, blk: 1 }, pool: 186 })]);
    const detail = buildStatDetail(p, ptsStat, "league", L, POS, "F");
    expect(detail.component).toBeNull();
    expect(detail.unit).toBe("points"); // "14.3 points" on the plates
    expect(detail.tableRows.every((r) => r.made === null && r.att === null)).toBe(true);
    const r22 = detail.tableRows.find((r) => r.year === 2022)!;
    expect(r22.rank).toBe(9);
    expect(r22.pool).toBe(186);
    expect(detail.tableRows.find((r) => r.year === 2021)!.rank).toBeNull();
  });

  it("shows the fallback line when the stat is too thin to chart", () => {
    const L = league([2020, 2021, 2022]);
    const p = player([
      playedSeason(2020, 40, { fg3Made: 0, fg3Att: 2 }),
      playedSeason(2021, 40, { fg3Made: 1, fg3Att: 3 }),
      playedSeason(2022, 40, { fg3Made: 2, fg3Att: 5 }),
    ]);
    const detail = buildStatDetail(p, tppStat, "league", L, POS, "F");
    expect(detail.bars).toHaveLength(0);
    expect(detail.chartFallback).toMatch(/enough three-point attempts/i);
    expect(detail.summary).toBeNull();
  });
});
