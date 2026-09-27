import { describe, it, expect } from "vitest";
import {
  buildHeatmapGrid,
  buildStatDetail,
  careerBasis,
  compareSegments,
  compareSentence,
  fmtCell,
  fmtV,
  gamesTier,
  gamesToRank,
  isPartialSeason,
  isSmallSample,
  isStatSmallSample,
  makeLeague,
  makePositionLookup,
  ordinal,
  ownStatAverage,
  pctAxis,
  positionNoun,
  rankNote,
  sampleNote,
  smallSampleReason,
  spokenValue,
  type HeatmapCell,
  type HeatmapGrid,
  type League,
  type PositionLookup,
} from "./deviation";
import { STATS } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, Season, SeasonPlayed, SeasonRanks } from "../data/api";

/**
 * Tests for the comparison logic in deviation.ts — the pure "brain" behind the heatmap and the
 * drill-down: which seasons count, what each season is measured against (their career, the
 * league, or their position that year), and the drill-down's chart, table, and career summary.
 */

// A 40-game slate ⇒ the color bar is 25% = 10 GP (under it: grey) and the rank bar is
// 20 × 40 / 44 = 18.2 ⇒ 19 GP (10–18: a partial season). Fixtures below use GP relative to that:
// 40 = a full season, single digits = small sample.
const SLATE = 40;

/** A season's ranks with every key present (the API never sends a partial object): counting
    stats default to 50th, the shooting %s to "under the floor" (null). */
function ranks(o: Partial<SeasonRanks> = {}): SeasonRanks {
  return { pts: 50, reb: 50, ast: 50, stl: 50, blk: 50, fgp: null, tpp: null, tsPct: null, ...o };
}

/** A played season with sensible stat defaults; override only what a case cares about. */
function playedSeason(year: number, gp: number, stats: Partial<SeasonPlayed> = {}): SeasonPlayed {
  return {
    year,
    played: true,
    age: 25,
    gp,
    teamGames: SLATE,
    pool: null,
    rank: null,
    ratePool: null,
    posPool: null,
    posRank: null,
    posRatePool: null,
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
    // Free throws + total points consistent with tsPct: 256 / (2 × (200 + 0.44 × 75)) = .549.
    ftMade: 60,
    ftAtt: 75,
    ptsTotal: 256,
    tsPct: 0.55,
    ...stats,
  };
}


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
    active: true,
    firstYear: seasons.length ? seasons[0]!.year : null,
    lastYear: seasons.length ? seasons[seasons.length - 1]!.year : null,
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
      stdev: { pts: 5, reb: 1.5, ast: 2, stl: 0.5, blk: 0.2 } });
    rows.push({ year, position: "F", pts: 12, reb: 5, ast: 2, stl: 1, blk: 0.7, fgp: 0.46, tpp: 0.34, tsPct: 0.56,
      stdev: { pts: 4.5, reb: 2, ast: 1.2, stl: 0.4, blk: 0.4 } });
    rows.push({ year, position: "C", pts: 10, reb: 7, ast: 1, stl: 0.7, blk: 1.5, fgp: 0.52, tpp: 0.2, tsPct: 0.58,
      stdev: { pts: 4, reb: 2.5, ast: 1, stl: 0.3, blk: 0.6 } });
  }
  return makePositionLookup(rows);
}

/** Empty position lookup for the league-only tests that don't exercise position mode. */
const POS = makePositionLookup([]);

describe("games tiers — a quarter of the team's games to be colored, 20 of 44 (scaled) to be ranked", () => {
  // Fixture seasons carry teamGames 40 ⇒ color bar 10 GP, rank bar 19 GP.

  it("small under a quarter, partial up to the rank bar, full from it", () => {
    expect(gamesTier(playedSeason(2022, 9))).toBe("small");
    expect(gamesTier(playedSeason(2022, 10))).toBe("partial");
    expect(gamesTier(playedSeason(2022, 18))).toBe("partial");
    expect(gamesTier(playedSeason(2022, 19))).toBe("full");
    expect(isSmallSample(playedSeason(2022, 9))).toBe(true);
    expect(isSmallSample(playedSeason(2022, 10))).toBe(false);
    expect(isPartialSeason(playedSeason(2022, 18))).toBe(true);
    expect(isPartialSeason(playedSeason(2022, 19))).toBe(false);
  });

  it("both bars scale with the team's games: 11/20 of 44, 7/13 of 28 (1997), 6/10 of 22 (the 2020 bubble)", () => {
    for (const [year, games, color, rank] of [[2026, 44, 11, 20], [1997, 28, 7, 13], [2020, 22, 6, 10], [2023, 40, 10, 19]] as const) {
      const at = (gp: number) => playedSeason(year, gp, { teamGames: games });
      expect(gamesTier(at(color - 1))).toBe("small");
      expect(gamesTier(at(color))).toBe("partial");
      expect(gamesTier(at(rank - 1))).toBe("partial");
      expect(gamesTier(at(rank))).toBe("full");
      expect(gamesToRank(at(rank))).toBe(rank);
    }
  });

  it("the player's own team decides: 15 games is partial of 34, full of 33 (the 2018 Aces, one game forfeited)", () => {
    expect(gamesTier(playedSeason(2018, 15, { teamGames: 34 }))).toBe("partial");
    expect(gamesTier(playedSeason(2018, 15, { teamGames: 33 }))).toBe("full");
    expect(sampleNote(playedSeason(2018, 12, { teamGames: 33 }), "pts", "league", "G")).toBe("Partial season: 12 of 33 games");
    expect(smallSampleReason(playedSeason(2018, 8, { teamGames: 33 }), "pts")).toBe("Small sample: 8 of 33 games");
    expect(gamesToRank(playedSeason(2018, 12, { teamGames: 33 }))).toBe(15);
  });

  it("sampleNote says how many games or shots the caveat is about, and what the grey means in this mode", () => {
    const lg = "Not compared with league average.";
    expect(sampleNote(playedSeason(2022, 8), "pts", "league", "G")).toBe(`Small sample: 8 of 40 games. ${lg}`);
    expect(sampleNote(playedSeason(2022, 8, { fg3Att: 200 }), "tpp", "league", "G")).toBe(`Small sample: 8 of 40 games. ${lg}`); // games first
    expect(sampleNote(playedSeason(2022, 40, { fg3Att: 29, fg3Made: 9 }), "tpp", "league", "G")).toBe(`Small sample: 29 attempts from three. ${lg}`);
    expect(sampleNote(playedSeason(2022, 40, { fgAtt: 80, fgMade: 30 }), "fgp", "league", "G")).toBe(`Small sample: 80 FG attempts. ${lg}`);
    expect(sampleNote(playedSeason(2022, 40, { fgAtt: 80, ftAtt: 40 }), "tsPct", "league", "G")).toBe(`Small sample: 97 TS possessions. ${lg}`); // 97.6 rounded DOWN
    expect(sampleNote(playedSeason(2022, 40, { fgAtt: 99, ftAtt: 2 }), "tsPct", "league", "G")).toBe(`Small sample: 99 TS possessions. ${lg}`); // 99.88: never "100" beside a floor of 100
    expect(sampleNote(playedSeason(2022, 40, { fg3Att: 1, fg3Made: 1 }), "tpp", "league", "G")).toBe(`Small sample: 1 attempt from three. ${lg}`); // singular
    expect(sampleNote(playedSeason(2022, 15), "pts", "league", "G")).toBe("Partial season: 15 of 40 games");
    expect(sampleNote(playedSeason(2022, 15, { fg3Att: 29 }), "tpp", "league", "G")).toBe(`Small sample: 29 attempts from three. ${lg}`); // the shot floor wins over partial
    expect(sampleNote(playedSeason(2022, 40), "pts", "league", "G")).toBeNull();
    expect(sampleNote(playedSeason(2022, 40), "tpp", "league", "G")).toBeNull();
    // The second sentence follows the mode: self → the career average; position → that position's average.
    expect(sampleNote(playedSeason(2022, 8), "pts", "self", "G")).toBe("Small sample: 8 of 40 games. Left out of career average.");
    expect(sampleNote(playedSeason(2022, 8), "pts", "position", "C")).toBe("Small sample: 8 of 40 games. Not compared with center average.");
    expect(sampleNote(playedSeason(2022, 8), "pts", "position", "F")).toBe("Small sample: 8 of 40 games. Not compared with forward average.");
    expect(sampleNote(playedSeason(2022, 15), "pts", "self", "G")).toBe("Partial season: 15 of 40 games"); // partial: same in every mode
  });

  it("smallSampleReason is the note's first sentence, and non-null exactly when the (season, stat) is a small sample", () => {
    expect(smallSampleReason(playedSeason(2022, 8), "pts")).toBe("Small sample: 8 of 40 games");
    expect(smallSampleReason(playedSeason(2022, 40, { fg3Att: 29, fg3Made: 9 }), "tpp")).toBe("Small sample: 29 attempts from three");
    expect(smallSampleReason(playedSeason(2022, 15), "pts")).toBeNull(); // partial is not a small sample
    const cases = [
      playedSeason(2022, 8),
      playedSeason(2022, 15),
      playedSeason(2022, 40),
      playedSeason(2022, 40, { fg3Att: 29, fg3Made: 9 }),
      playedSeason(2022, 40, { fgAtt: 80, fgMade: 30 }),
      playedSeason(2022, 40, { fgAtt: 99, ftAtt: 2 }),
      playedSeason(2022, 15, { fg3Att: 29 }),
    ];
    for (const season of cases) {
      for (const key of ["pts", "reb", "fgp", "tpp", "tsPct"] as const) {
        const reason = smallSampleReason(season, key);
        expect(reason != null).toBe(isStatSmallSample(season, key));
        if (reason != null) expect(sampleNote(season, key, "league", "G")).toBe(`${reason}. Not compared with league average.`);
      }
    }
  });

  it("rankNote on a partial season: needs N games, for any stat, in any mode with a crowd", () => {
    const s = playedSeason(2022, 15, { pool: 122, ratePool: { fgp: 70, tpp: 65, tsPct: 98 }, posPool: 40 });
    expect(rankNote(s, "pts", "league", "G")).toBe("Needs 19 games to rank");
    expect(rankNote(s, "tpp", "self", "G")).toBe("Needs 19 games to rank");
    expect(rankNote(s, "reb", "position", "G")).toBe("Needs 19 games to rank");
    expect(rankNote(playedSeason(2022, 15, { posPool: null }), "pts", "position", "G")).toBeNull(); // no position crowd that year
    expect(rankNote(playedSeason(2022, 15), "pts", "league", "G")).toBeNull(); // no league row
  });

  it("a partial season is tinted, counted and asterisked in the grid; ranked nowhere; counted in the career average", () => {
    const L3 = league([2020, 2021, 2022]);
    const p = player([
      playedSeason(2020, 40, { pts: 10, rank: ranks({ pts: 40 }), pool: 120 }),
      playedSeason(2021, 15, { pts: 20, pool: 120 }), // partial: the API sends no rank, the year's pool only
      playedSeason(2022, 40, { pts: 12, rank: ranks({ pts: 30 }), pool: 120 }),
    ]);
    const g = buildHeatmapGrid(p, "league", L3, POS, "F");
    const c21 = g.rows.find((r) => r[0].year === 2021)![0];
    expect(c21).toMatchObject({ statKey: "pts", partial: true, smallSample: false, selectable: true, note: "Partial season: 15 of 40 games" });
    // A grey cell's note names this mode's crowd.
    const q = player([playedSeason(2020, 40), playedSeason(2021, 5), playedSeason(2022, 40)]);
    expect(buildHeatmapGrid(q, "league", L3, POS, "F").rows.find((r) => r[0].year === 2021)![0].note).toBe("Small sample: 5 of 40 games. Not compared with league average.");
    expect(buildHeatmapGrid(q, "self", L3, POS, "F").rows.find((r) => r[0].year === 2021)![0].note).toBe("Small sample: 5 of 40 games. Left out of career average.");
    expect(c21.colorT).not.toBeNull(); // tinted
    const full = g.rows.find((r) => r[0].year === 2022)![0];
    expect(full).toMatchObject({ partial: false, note: null });
    const d = buildStatDetail(p, STATS.find((s) => s.key === "pts")!, "league", L3, POS, "F");
    expect(d.tableRows.find((r) => r.year === 2021)).toMatchObject({ partial: true, smallSample: false, rank: null, pool: 120, unranked: "Needs 19 games to rank", note: null });
    // A small-sample row's rank dash says why instead, in the footnote's words (no mode tail).
    const dq = buildStatDetail(q, STATS.find((s) => s.key === "pts")!, "league", L3, POS, "F");
    expect(dq.tableRows.find((r) => r.year === 2021)).toMatchObject({ smallSample: true, rank: null, unranked: null, note: "Small sample: 5 of 40 games" });
    expect(dq.tableRows.find((r) => r.year === 2022)).toMatchObject({ smallSample: false, note: null });
    expect(d.summary!.careerAvg).toBe("14.0"); // (10 + 20 + 12) / 3 — the partial season counts
    expect(d.summary!.seasons).toBe(3); // and is charted
    expect(d.summary!.bestRank).toEqual({ rank: 30, pool: 120, year: 2022 });
    // Self mode: the partial season is in the career average the cells are measured against.
    const self = buildHeatmapGrid(p, "self", L3, POS, "F");
    expect(self.rows.find((r) => r[0].year === 2021)![0].refValue).toBeCloseTo(14, 5);
  });

  it("careerBasis: the seasons over the COLOR bar (partial ones count), or every season when fewer than two are", () => {
    const a = playedSeason(2019, 40), b = playedSeason(2020, 5), c = playedSeason(2021, 40), d = playedSeason(2022, 15);
    expect(careerBasis([a, b, c, d])).toEqual([a, c, d]);
    expect(careerBasis([a, b])).toEqual([a, b]); // one counted season → every season
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

  it("pools TS% from total points over shooting possessions, not a mean of season TS%", () => {
    const a = playedSeason(2021, 40, { ptsTotal: 500, fgAtt: 400, ftAtt: 100, tsPct: 0.563 }); // 500 / (2 × 444)
    const b = playedSeason(2022, 40, { ptsTotal: 10, fgAtt: 5, ftAtt: 0, tsPct: 1.0 }); // 10 / (2 × 5) — a 5-shot season
    expect(ownStatAverage("tsPct", [a, b])).toBeCloseTo(510 / (2 * 449), 5); // ≈ .568, not (.563 + 1.0) / 2
  });

  it("returns null for a rate stat when there were zero attempts", () => {
    expect(ownStatAverage("tpp", [playedSeason(2021, 40, { fg3Made: 0, fg3Att: 0 })])).toBeNull();
  });

  it("still means counting stats per-game (behavior unchanged for non-rate stats)", () => {
    const seasons = [playedSeason(2021, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 20 })];
    expect(ownStatAverage("pts", seasons)).toBe(15);
  });
});

describe("isStatSmallSample — per-stat gate (games, OR the tint floor for a shooting %)", () => {

  it("flags a full-games season as small sample for a shooting % under its tint floor", () => {
    const s = playedSeason(2021, 40, { fg3Made: 4, fg3Att: 10 }); // full games, a 4-of-10
    expect(isSmallSample(s)).toBe(false); // games gate: a full season
    expect(isStatSmallSample(s, "tpp")).toBe(true); // tint floor: too few threes
    expect(isStatSmallSample(s, "pts")).toBe(false); // counting stat has no shot floor
  });

  it("3P%: 39 attempts is small, 40 is not (fixed count, not scaled to the slate)", () => {
    expect(isStatSmallSample(playedSeason(2021, 40, { fg3Att: 39, fg3Made: 13 }), "tpp")).toBe(true);
    expect(isStatSmallSample(playedSeason(2021, 40, { fg3Att: 40, fg3Made: 13 }), "tpp")).toBe(false);
  });

  it("FG%: 99 attempts is small, 100 is not", () => {
    expect(isStatSmallSample(playedSeason(2021, 40, { fgAtt: 99, fgMade: 45 }), "fgp")).toBe(true);
    expect(isStatSmallSample(playedSeason(2021, 40, { fgAtt: 100, fgMade: 45 }), "fgp")).toBe(false);
  });

  it("TS%: counts shooting possessions, FGA + 0.44 × FTA, against 100", () => {
    expect(isStatSmallSample(playedSeason(2021, 40, { fgAtt: 80, ftAtt: 40 }), "tsPct")).toBe(true); // 97.6
    expect(isStatSmallSample(playedSeason(2021, 40, { fgAtt: 90, ftAtt: 25 }), "tsPct")).toBe(false); // 101
  });

  it("still flags a games-small season regardless of how many attempts it had", () => {
    const s = playedSeason(2021, 3, { fg3Att: 200, fg3Made: 80 }); // few games, lots of threes
    expect(isStatSmallSample(s, "tpp")).toBe(true);
  });
});

describe("rankNote — why a compared shooting-% season has no rank", () => {
  // Fixture seasons carry teamGames 40 ⇒ 3P% needs ceil(60 × 40 / 44) = 55 attempts or ceil(20 × 40 / 44) = 19 made.

  it("league mode: under the rank floor → says how many attempts (or makes) it needed; ranked → null", () => {
    const under = playedSeason(2022, 40, { fg3Made: 9, fg3Att: 45, rank: ranks(), ratePool: { fgp: 70, tpp: 65, tsPct: 98 } });
    expect(rankNote(under, "tpp", "league", "G")).toBe("Needs 55 attempts from three or 19 made to rank");
    expect(rankNote(under, "fgp", "league", "G")).toBe("Needs 182 FG attempts or 78 made to rank"); // ceil(200 × 40 / 44), ceil(85 × 40 / 44)
    expect(rankNote(under, "tsPct", "league", "G")).toBe("Needs 114 TS possessions to rank"); // ceil(125 × 40 / 44); TS% has no makes route
    const ranked = playedSeason(2022, 40, { rank: ranks({ tpp: 4 }), ratePool: { fgp: 70, tpp: 65, tsPct: 98 } });
    expect(rankNote(ranked, "tpp", "league", "G")).toBeNull();
  });

  it("never for a counting stat, a games-small season, or a year with no pool", () => {
    expect(rankNote(playedSeason(2022, 40, { rank: ranks() }), "pts", "league", "G")).toBeNull();
    expect(rankNote(playedSeason(2022, 5, { ratePool: { fgp: 70, tpp: 65, tsPct: 98 } }), "tpp", "league", "G")).toBeNull();
    expect(rankNote(playedSeason(2022, 40), "tpp", "league", "G")).toBeNull(); // ratePool null
  });

  it("position mode: no bucket → null (a counting stat's blank); a thin bucket → says so; else the floor", () => {
    const noBucket = playedSeason(2022, 40, { posPool: null, posRatePool: null });
    expect(rankNote(noBucket, "tpp", "position", "C")).toBeNull();
    const thin = playedSeason(2022, 40, { posPool: 20, posRank: ranks(), posRatePool: { fgp: 20, tpp: null, tsPct: 20 } });
    expect(rankNote(thin, "tpp", "position", "C")).toBe("Fewer than 8 centers made enough to rank");
    const under = playedSeason(2022, 40, { posPool: 20, posRank: ranks(), posRatePool: { fgp: 20, tpp: 12, tsPct: 20 } });
    expect(rankNote(under, "tpp", "position", "C")).toBe("Needs 55 attempts from three or 19 made to rank");
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

describe("spokenValue — a cell's value in its accessible name", () => {
  it("says what the cell shows, then the exact value when it differs", () => {
    expect(spokenValue(fmtCell(0.527, true), fmtV(0.527, true))).toBe("53%, exactly 52.7%");
    expect(spokenValue(fmtCell(0.317, true), fmtV(0.317, true))).toBe("32%, exactly 31.7%");
  });
  it("says it once when the exact value is the shown one", () => {
    expect(spokenValue(fmtCell(0.31, true), fmtV(0.31, true))).toBe("31%"); // 31.0%
    expect(spokenValue(fmtCell(1, true), fmtV(1, true))).toBe("100%");
    expect(spokenValue(fmtCell(0, true), fmtV(0, true))).toBe("0%");
    expect(spokenValue(fmtCell(26.2, false), fmtV(26.2, false))).toBe("26.2"); // counting stats show the exact value
    expect(spokenValue(fmtCell(null, true), fmtV(null, true))).toBe("—");
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
    expect(cell(g, 2022, "tpp").deltaFmt).toBe("+11.0"); // percentage points; the unit is spoken, not printed
    // The cell draws the rounded glance form; the popover / accessible name keep the exact value.
    expect(cell(g, 2022, "tpp").cellFmt).toBe("44%");
    expect(cell(g, 2022, "tpp").valueFmt).toBe("44.0%");
  });

  it("peer mode falls back to relative-% color when the league spread is absent (pre-004 data)", () => {
    const Lnull = makeLeague([
      { year: 2022, scheduledGames: SLATE, pts: 12, reb: 5, ast: 3, stl: 1, blk: 0.8, fgp: 0.43, tpp: 0.33, tsPct: 0.52, stdev: null },
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
    expect(d.summary?.careerAvg).toBe("15.0");
  });

  it("position mode: the player's OWN bucket; no reference for a year with no bucket", () => {
    // /positions has only 2024; the 2022 center row has no bucket → no reference, neutral dot, note.
    const L = league([2022, 2024]);
    const p = player([playedSeason(2022, 40, { pts: 16 }), playedSeason(2024, 40, { pts: 16 })], "C");
    const d = buildStatDetail(p, pts, "position", L, positions([2024]), "C");
    expect(bar(d, 2024).baseFmt).toBe("10.0"); // centers = 10 (guards 15, league 12)
    expect(bar(d, 2022).baseFmt).toBeNull();
    expect(bar(d, 2022).up).toBeNull();
  });

  it("never falls back to league in position mode when the lookup is missing (reference stays null)", () => {
    const L = league([2024]);
    const p = player([playedSeason(2024, 40)], "G");
    const d = buildStatDetail(p, pts, "position", L, null, "G");
    expect(d.bars[0].baseFmt).toBeNull();
  });
});


describe("buildStatDetail — career summary plates", () => {
  const pts = STATS.find((s) => s.key === "pts")!;
  const tpp = STATS.find((s) => s.key === "tpp")!;
  const rk = (pts: number, pool: number) => ({ rank: ranks({ pts }), pool });

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
    expect(s.bestRank).toEqual({ rank: 3, pool: 100, year: 2022 }); // the 1st-of-80 was a small sample
  });

  it("best rank is chosen by share of the pool, not by the rank number", () => {
    // Gabby Williams' rebounds, measured 2026-09-21: 18th of 65 (top 28%) vs 27th of 106 (top 25%).
    const L = league([2018, 2022]);
    const p = player([playedSeason(2018, 40, { ...rk(18, 65) }), playedSeason(2022, 40, { ...rk(27, 106) })]);
    expect(buildStatDetail(p, pts, "league", L, POS, "F").summary!.bestRank).toEqual({ rank: 27, pool: 106, year: 2022 });
    // Even a 1st place loses to a smaller share of a much larger pool: 1/65 = 1.5% vs 2/158 = 1.3%.
    const q = player([playedSeason(2018, 40, { ...rk(1, 65) }), playedSeason(2022, 40, { ...rk(2, 158) })]);
    expect(buildStatDetail(q, pts, "league", L, POS, "F").summary!.bestRank).toEqual({ rank: 2, pool: 158, year: 2022 });
    // Exactly equal shares (5/50 = 10/100) → the larger pool.
    const e = player([playedSeason(2018, 40, { ...rk(5, 50) }), playedSeason(2022, 40, { ...rk(10, 100) })]);
    expect(buildStatDetail(e, pts, "league", L, POS, "F").summary!.bestRank).toEqual({ rank: 10, pool: 100, year: 2022 });
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

  it("position mode ranks among the position; league and self modes among the league", () => {
    const L = league([2021, 2022]);
    const both = { rank: ranks({ pts: 30 }), pool: 100, posRank: ranks({ pts: 3 }), posPool: 20 };
    const p = player([playedSeason(2021, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 18, ...both })], "F");
    const pos = buildStatDetail(p, pts, "position", L, POS, "F");
    expect(pos.tableRows.find((r) => r.year === 2022)).toMatchObject({ rank: 3, pool: 20 });
    expect(pos.summary!.bestRank).toEqual({ rank: 3, pool: 20, year: 2022 });
    for (const mode of ["league", "self"] as const) {
      const d = buildStatDetail(p, pts, mode, L, POS, "F");
      expect(d.tableRows.find((r) => r.year === 2022)).toMatchObject({ rank: 30, pool: 100 });
      expect(d.summary!.bestRank).toEqual({ rank: 30, pool: 100, year: 2022 });
    }
    // No position bucket that year → no position rank, even though the league rank exists.
    const q = player([playedSeason(2021, 40), playedSeason(2022, 40, { ...both, posRank: null, posPool: null })], "F");
    expect(buildStatDetail(q, pts, "position", L, POS, "F").tableRows.find((r) => r.year === 2022)).toMatchObject({ rank: null, pool: null });
  });

  it("shooting %s rank in their own pool, with whole-percent plate numbers; no full season → no summary", () => {
    const L = league([2021, 2022]);
    // tpp is read from the season (the fixture default is .35), so set it to match the makes/attempts.
    const rp = { fgp: 70, tpp: 65, tsPct: 98 };
    const p = player([
      playedSeason(2021, 40, { tpp: 0.35, fg3Made: 35, fg3Att: 100, rank: ranks({ tpp: 30 }), pool: 122, ratePool: rp }),
      playedSeason(2022, 40, { tpp: 0.44, fg3Made: 44, fg3Att: 100, rank: ranks({ tpp: 4 }), pool: 122, ratePool: rp }),
    ]);
    const d = buildStatDetail(p, tpp, "league", L, POS, "F");
    const s = d.summary!;
    expect(s.bestRank).toEqual({ rank: 4, pool: 65, year: 2022 }); // the 3P% pool, not the points pool of 122
    expect(d.tableRows.find((r) => r.year === 2022)).toMatchObject({ rank: 4, pool: 65, unranked: null });
    expect(s.high).toEqual({ fmt: "44", year: 2022 }); // 44.0% → "44" (the plate adds the sign)
    expect(s.careerAvg).toBe("40"); // pooled 79/200 = 39.5% → rounds to 40
    const thin = player([playedSeason(2022, 3)]);
    expect(buildStatDetail(thin, pts, "league", L, POS, "F").summary).toBeNull();
  });

  it("a tinted shooting-% season under the rank floor: no rank, a note saying why, still charted", () => {
    const L = league([2021, 2022]);
    const rp = { fgp: 70, tpp: 65, tsPct: 98 };
    const p = player([
      playedSeason(2021, 40, { tpp: 0.35, fg3Made: 35, fg3Att: 100, rank: ranks({ tpp: 30 }), pool: 122, ratePool: rp }),
      playedSeason(2022, 40, { tpp: 0.3, fg3Made: 15, fg3Att: 50, rank: ranks(), pool: 122, ratePool: rp }), // 50 att < 55 and 15 made < 19
    ]);
    const d = buildStatDetail(p, tpp, "league", L, POS, "F");
    expect(d.tableRows.find((r) => r.year === 2022)).toMatchObject({ rank: null, pool: 65, unranked: "Needs 55 attempts from three or 19 made to rank" });
    expect(d.bars.find((b) => b.year === 2022)!.kind).toBe("full"); // 50 attempts clear the tint floor
    expect(d.summary!.bestRank).toEqual({ rank: 30, pool: 65, year: 2021 });
  });

  it("career % pools every season over the GAMES gate — an attempt-thin season stays in the pool, out of the chart", () => {
    const L = league([2021, 2022, 2023]);
    const p = player([
      playedSeason(2021, 40, { tpp: 0.35, fg3Made: 35, fg3Att: 100 }),
      playedSeason(2022, 40, { tpp: 0.4, fg3Made: 2, fg3Att: 5 }), // full games, five threes: grey cell
      playedSeason(2023, 40, { tpp: 0.44, fg3Made: 44, fg3Att: 100 }),
    ]);
    const d = buildStatDetail(p, tpp, "league", L, POS, "F");
    expect(d.summary!.seasons).toBe(2); // charted: the two over the tint floor
    expect(d.summary!.careerAvg).toBe("40"); // pooled 81/205 = 39.5% → 40 (the 2-of-5 adds two makes, not a 40% season)
    expect(d.bars.find((b) => b.year === 2022)!.kind).toBe("small");
    // A games-small season IS left out of the pool, as for every stat.
    const q = player([playedSeason(2021, 40, { fg3Made: 35, fg3Att: 100 }), playedSeason(2022, 5, { fg3Made: 20, fg3Att: 20 }), playedSeason(2023, 40, { fg3Made: 44, fg3Att: 100 })]);
    expect(buildStatDetail(q, tpp, "league", L, POS, "F").summary!.careerAvg).toBe("40"); // 79/200, not 99/220
  });
});

describe("buildStatDetail — chart drops thin seasons; table keeps the full record", () => {
  const tppStat = STATS.find((s) => s.key === "tpp")!;
  const ptsStat = STATS.find((s) => s.key === "pts")!;

  it("charts only trustworthy seasons but lists every season in the table", () => {
    const L = league([2019, 2020, 2021, 2022]);
    const seasons: Season[] = [
      { year: 2019, played: false, reason: "did not play" },
      playedSeason(2020, 40, { fg3Made: 30, fg3Att: 80 }), // 37.5% — charted
      playedSeason(2021, 40, { fg3Made: 1, fg3Att: 1 }), // 100% on 1 attempt — dropped from chart
      playedSeason(2022, 40, { fg3Made: 27, fg3Att: 60 }), // 45% on 60 attempts — charted
    ];
    const detail = buildStatDetail(player(seasons), tppStat, "league", L, POS, "F");
    expect(detail.bars.map((b) => `${b.year}:${b.kind}`)).toEqual(["2019:missed", "2020:full", "2021:small", "2022:full"]);
    expect(detail.chartFallback).toBeNull();
    expect(detail.bars.filter((b) => b.kind === "full").every((b) => b.baseFmt != null)).toBe(true);
    expect(detail.tableRows.map((r) => r.year)).toEqual([2022, 2021, 2020, 2019]);
    const thin = detail.tableRows.find((r) => r.year === 2021)!;
    expect(thin.smallSample).toBe(true);
    expect(thin.deltaFmt).toBe("—"); // delta suppressed for a noise season
    expect(thin.unranked).toBeNull();
    expect(thin.note).toBe("Small sample: 1 attempt from three"); // the rank dash's tip
    expect(detail.tableRows.find((r) => r.year === 2022)!.note).toBeNull();
    expect(detail.tableRows.find((r) => r.year === 2019)!.note).toBeNull(); // a missed season
    // The table's Diff prints the bare number — the unit is in the header tooltip.
    expect(detail.tableRows.find((r) => r.year === 2022)!.deltaFmt).toMatch(/^[+−]\d+\.\d$/);
    expect(detail.unit).toBe("%"); // the sign is the word after a whole-percent plate number
    expect(detail.unitShort).toBe("%");
  });

  it("the rank column reads the API's rank + pool", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40), playedSeason(2022, 40, { rank: ranks({ pts: 9 }), pool: 186 })]);
    const detail = buildStatDetail(p, ptsStat, "league", L, POS, "F");
    expect(detail.unit).toBe("points"); // what a screen reader hears after the plate number
    expect(detail.unitShort).toBe("PTS"); // what the plate prints: "14.3 PTS" — ESPN's column code
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
    expect(detail.bars.every((b) => b.kind === "small")).toBe(true);
    expect(detail.chartFallback).toBe("Not enough data to chart a trend.");
    expect(detail.summary).toBeNull();
  });
});

describe("buildStatDetail — every season on the timeline is a chart column", () => {
  const pts = STATS.find((s) => s.key === "pts")!;
  const tpp = STATS.find((s) => s.key === "tpp")!;
  const missed = (year: number): Season => ({ year, played: false, reason: "Did not play" });

  it("draws a full season, a small sample (hollow, no reference) and a missed year (empty), in order", () => {
    const L = league([2018, 2019, 2020, 2021, 2022]);
    const p = player([playedSeason(2018, 40), playedSeason(2019, 4, { pts: 30 }), playedSeason(2020, 40), missed(2021), playedSeason(2022, 40)]);
    const d = buildStatDetail(p, pts, "league", L, POS, "F");
    expect(d.bars.map((b) => `${b.year}:${b.kind}`)).toEqual(["2018:full", "2019:small", "2020:full", "2021:missed", "2022:full"]);
    const small = d.bars[1];
    expect(small.baseFmt).toBeNull();
    expect(small.basePct).toBeNull();
    expect(small.labelFmt).toBe("30.0"); // its value is still printed
    const gap = d.bars[3];
    expect(gap.hPct).toBeNull();
    expect(gap.labelFmt).toBe("");
    expect(gap.valFmt).toBe("—");
  });

  it("a small-sample value stays OUT of the axis fit and is clamped inside the frame", () => {
    // Full seasons 10 and 14 (league avg 12) → axis 14 × 1.2 = 16.8. A 50-ppg season on 4 games
    // would lift it to 60 if it counted; it doesn't.
    const L = league([2018, 2019, 2020]);
    const p = player([playedSeason(2018, 40, { pts: 10 }), playedSeason(2019, 4, { pts: 50 }), playedSeason(2020, 40, { pts: 14 })]);
    const d = buildStatDetail(p, pts, "league", L, POS, "F");
    expect(d.axisTicks[2].label).toBe("16.8");
    expect(d.bars[1].hPct).toBe(88); // 50 is above the top → clamped under the label headroom
  });


  it("the fallback still replaces the plot with fewer than two full seasons", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40, { tpp: 1, fg3Made: 1, fg3Att: 1 }), playedSeason(2022, 40, { tpp: 0.5, fg3Made: 1, fg3Att: 2 })]);
    expect(buildStatDetail(p, tpp, "league", L, POS, "F").chartFallback).not.toBeNull();
  });
});

describe("pctAxis — a shooting-% chart's fitted vertical scale", () => {
  it("fits the data with whole-five ends and a whole-ten span (the measured Gabby Williams TS% case)", () => {
    // Her seasons 42–55%, league refs 51.8–56.1% → 40–60 (from zero the data used ~21% of the plot).
    expect(pctAxis([0.48, 0.47, 0.5, 0.51, 0.42, 0.55, 0.51, 0.561, 0.518])).toEqual({ lo: 0.4, hi: 0.6 });
  });

  it("never shows less than 20 points, so a tiny gap stays tiny; ties grow upward", () => {
    // 55–56 → 50–60 first, then grows up (less room above: 4 vs 5), then down → centered on the data.
    expect(pctAxis([0.55, 0.56])).toEqual({ lo: 0.45, hi: 0.65 });
    // 52–63 → 50–65 is only 15 wide with equal room both sides → grows up to 50–70.
    expect(pctAxis([0.52, 0.63])).toEqual({ lo: 0.5, hi: 0.7 });
  });

  it("keeps at least a point of clearance, so a value on a five doesn't sit on the frame", () => {
    const a = pctAxis([0.4, 0.55]);
    expect(a.lo).toBeLessThanOrEqual(0.39);
    expect(a.hi).toBeGreaterThanOrEqual(0.56);
    expect(Math.round((a.hi - a.lo) * 100) % 10).toBe(0);
  });

  it("keeps the top value under the label headroom, growing the top (the Nneka Ogwumike 3P% case)", () => {
    // Measured 2026-09-23: 3P% values 8–62% fit a 5–65% axis, putting the 62% at 95% of the height
    // and its label above the frame. The top must sit at ≤ 88%.
    const vals = [0.3, 0.08, 0.62, 0.34, 0.35, 0.34, 0.5, 0.37, 0.37, 0.34, 0.41, 0.37, 0.4];
    const a = pctAxis(vals);
    expect((0.62 - a.lo) / (a.hi - a.lo)).toBeLessThanOrEqual(0.88);
    expect(Math.round((a.hi - a.lo) * 100) % 10).toBe(0);
    // A tight case: 42–57.8 fit 40–60 by the other rules, but 57.8 would sit at 89% → 35–65.
    expect(pctAxis([0.42, 0.578])).toEqual({ lo: 0.35, hi: 0.65 });
    // Just under the line stays put: 57.5 on 40–60 is exactly 87.5%.
    expect(pctAxis([0.42, 0.575])).toEqual({ lo: 0.4, hi: 0.6 });
  });

  it("grows toward the side with less room, and never below zero", () => {
    expect(pctAxis([0.31, 0.44])).toEqual({ lo: 0.3, hi: 0.5 });
    expect(pctAxis([0.02, 0.08])).toEqual({ lo: 0, hi: 0.2 });
    expect(pctAxis([])).toEqual({ lo: 0, hi: 1 });
  });
});

describe("buildStatDetail — the chart's vertical scale by stat type", () => {
  const pts = STATS.find((s) => s.key === "pts")!;
  const tpp = STATS.find((s) => s.key === "tpp")!;

  it("a shooting % is drawn on the fitted axis: whole-percent ticks, dots placed within it", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40, { tpp: 0.31, fg3Made: 31, fg3Att: 100 }), playedSeason(2022, 40, { tpp: 0.44, fg3Made: 44, fg3Att: 100 })]);
    const d = buildStatDetail(p, tpp, "league", L, POS, "F");
    const refs = d.bars.map((b) => parseFloat(b.baseFmt!) / 100);
    const a = pctAxis([0.31, 0.44, ...refs]);
    expect(d.axisTicks.map((t) => t.label)).toEqual([a.lo, (a.lo + a.hi) / 2, a.hi].map((v) => `${Math.round(v * 100)}%`));
    expect(d.axisTicks[0].label).not.toBe("0%"); // the point of the change
    expect(d.bars[1].hPct).toBeCloseTo(((0.44 - a.lo) / (a.hi - a.lo)) * 100, 1);
    expect(d.bars.map((b) => b.labelFmt)).toEqual(["31%", "44%"]); // beside the dot: the glance form, no tenth
    for (const b of d.bars) for (const y of [b.hPct!, b.basePct!]) expect(y > 0 && y < 100).toBe(true);
  });

  it("a counting stat still starts at zero", () => {
    const L = league([2021, 2022]);
    const p = player([playedSeason(2021, 40, { pts: 10 }), playedSeason(2022, 40, { pts: 18 })]);
    const d = buildStatDetail(p, pts, "league", L, POS, "F");
    expect(d.axisTicks[0].label).toBe("0.0");
    expect(d.bars.map((b) => b.labelFmt)).toEqual(["10.0", "18.0"]); // a counting stat keeps its tenth
  });
});


describe("compareSegments", () => {
  it("offers all three modes to a multi-season player with a position and the lookup loaded", () => {
    const segs = compareSegments(true, "C", true);
    expect(segs.map((s) => s.value)).toEqual(["self", "league", "position"]);
    expect(segs.map((s) => s.label)).toEqual(["Self", "League", "Centers"]);
    expect(segs.every((s) => !s.disabled && s.reason == null)).toBe(true);
  });

  it("always returns three segments — a mode the page can't honor is disabled with a reason", () => {
    const one = compareSegments(false, "G", true);
    expect(one).toHaveLength(3);
    expect(one[0]).toMatchObject({ value: "self", disabled: true, reason: "Needs two or more seasons" });
    expect(one[2]).toMatchObject({ value: "position", label: "Guards", disabled: false });

    const noPos = compareSegments(true, null, true);
    expect(noPos[2]).toMatchObject({ value: "position", label: "Position", disabled: true, reason: "No position on record" });

    const noLookup = compareSegments(true, "F", false);
    expect(noLookup[2]).toMatchObject({ value: "position", label: "Forwards", disabled: true, reason: "Position averages unavailable" });
  });

  it("never disables the league mode", () => {
    for (const segs of [compareSegments(false, null, false), compareSegments(true, "C", true)]) {
      expect(segs[1]).toEqual({ value: "league", label: "League", disabled: false, reason: null });
    }
  });
});

describe("compareSentence", () => {
  it("names the comparison for each mode, the crowd in position mode", () => {
    expect(compareSentence("self", "A'ja", "C")).toBe("Each season against A'ja's own career averages.");
    expect(compareSentence("league", "A'ja", "C")).toBe("Each season against the league averages of that year.");
    expect(compareSentence("position", "A'ja", "C")).toBe("Each season against other centers that year.");
    expect(compareSentence("position", "Sabrina", "G")).toBe("Each season against other guards that year.");
  });
});
