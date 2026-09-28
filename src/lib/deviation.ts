import { STATS, type StatDef } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, SeasonPlayed } from "../data/api";

// Every comparison on the page — heatmap cells and the drill-down beneath — measures a season
// against ONE switchable reference (HeatmapMode: their career, the league, or their position that
// year). The drill-down used to have its own target type and a picked "subject" season; both went
// when it moved under the heatmap (the cell popover carries per-season detail). See DECISIONS.

/** The "played enough to count" bar (D6, re-set 2026-09-25 — DECISIONS): a season qualifies at
    QUALIFYING_GAMES of a FULL_SCHEDULE_GAMES-game schedule, scaled to that year's slate — 20 of 44
    today, 13 of 28 in 1997, 10 of the 2020 bubble's 22. That is Basketball-Reference's WNBA
    per-game requirement (20 games), scaled so a short season isn't judged by a long one's bar. It
    replaced 25% (11 of 44), which let a handful of games count as a year. Compared in integers
    (gp × FULL < QUALIFYING × slate), never a float fraction. Must stay equal to wnba-data's pair
    (src/db/computeLeague.ts), which uses the same bar to pick who qualifies for the league averages,
    spreads and ranks — one crowd. Keep them paired. */
export const QUALIFYING_GAMES = 20;
export const FULL_SCHEDULE_GAMES = 44;
/** The lower games bar — enough games to COLOR a row (2026-09-25, the user: "no tint ruins the
    heatmap", a 17-game Kelsey Plum season is still worth a color). A quarter of the schedule: 11 of
    44, 7 of 28, 6 of 22. Under it the row is grey and not compared; from here to the rank bar above
    it is a "partial season" — tinted and counted in career averages, marked with the asterisk, and
    NOT ranked (the crowd and the ranks stay at QUALIFYING_GAMES, so a partial season is measured
    against the full-season crowd without being in it, like a shooting % under its rank floor). */
export const COLOR_GAMES_FRACTION = 0.25;
/** A full-length deviation bar = the stat is this fraction above/below baseline (S1). Used for
    the shooting-% bars (relative change) and as the fallback for a counting stat when its
    comparison group has no spread on the wire (data older than migration 004). */
const BAR_FULL_SCALE = 0.5;
/** A full-length COUNTING-stat bar = this many "steps" (population standard deviations of the
    comparison group) above/below the baseline. 3 already means "almost nobody's out here", so
    the rare 4-step+ signature seasons clip to a full bar. See AboutView / DECISIONS. */
const FULL_STEPS = 3;

/** Enough shots to COLOR a shooting-% cell — the "tint floor" (2026-09-25, DECISIONS): field-goal
    attempts for FG%, three-point attempts for 3P%, shooting possessions (FGA + 0.44 × FTA, the TS%
    denominator) for TS%. Fixed counts, not scaled to the schedule: 40 threes are 40 threes in any
    era — the question is whether the number is stable, and at these floors one make moves it by
    2.5 points (3P%) or 1 point (FG%, TS%). Measured on every qualified season since 1997: the old
    10-attempt floor tinted a 4-of-10 (Aliyah Boston 2023, 40%) as a hot cell and passed 99% of FG%
    seasons; these keep 44% / 69% / 72% of cells tinted, and every featured guard's row whole. This
    gate is ORTHOGONAL to the games gate: a full-games season can still be attempt-thin. */
const TINT_FLOOR: Record<RateKey, number> = { fgp: 100, tpp: 40, tsPct: 100 };
/** Enough shots to RANK a shooting % — the API's floor (wnba-data queries.ts RATE_RANK_FLOOR), per
    44-game season and scaled to the year's slate: ATTEMPTS OR MAKES (user, 2026-09-25) — 3P% 60
    attempts or 20 made, FG% 200 attempts or 85 made, TS% 125 shooting possessions. Mirrored here ONLY
    to word the note on a colored cell that falls short ("Needs 55 attempts from three or 19 made to
    rank"); the rank itself always comes from the API, whose pool also requires TINT_FLOOR (so a
    ranked season is always a colored one — wnba-data RATE_TINT_FLOOR mirrors TINT_FLOOR). Keep all
    three paired. */
const RANK_FLOOR: Record<RateKey, { att: number; made?: number }> = {
  fgp: { att: 200, made: 85 },
  tpp: { att: 60, made: 20 },
  tsPct: { att: 125 },
};

/** Shooting-percentage stats that are a make/attempt ratio, mapped to where the raw pair lives
    on a season (rateAttempts and ownStatAverage read it). TS% is a rate too but not a single
    made/attempt pair — rateAttempts and ownStatAverage handle it from points, FGA and FTA. */
const RATE_STAT_ATTEMPTS: Partial<Record<StatKey, { made: keyof SeasonPlayed; att: keyof SeasonPlayed }>> = {
  fgp: { made: "fgMade", att: "fgAtt" },
  tpp: { made: "fg3Made", att: "fg3Att" },
};

export type StatKey = StatDef["key"];
/** The three shooting percentages: they carry the tint floor, rank in their own pool, and pool their
    career average from totals. */
export type RateKey = Extract<StatKey, "fgp" | "tpp" | "tsPct">;
export function isRateStat(key: StatKey): key is RateKey {
  return key === "fgp" || key === "tpp" || key === "tsPct";
}

/** The five counting stats whose bars measure in "steps" and carry a spread + percentile. The
    shooting %s (fgp/tpp/tsPct) are absent — they keep the relative-% bar and have neither. */
const COUNTING_KEYS = ["pts", "reb", "ast", "stl", "blk"] as const;
type CountingKey = (typeof COUNTING_KEYS)[number];
export function isCountingStat(key: StatKey): key is CountingKey {
  return (COUNTING_KEYS as readonly string[]).includes(key);
}


/**
 * Per-year league lookups, built once from the API's /league data: real per-year averages and
 * spreads. (The games bars don't come from here: each season carries its own team's games,
 * SeasonPlayed.teamGames.)
 */
export interface League {
  /** League average of a stat for a year; null if that year isn't in the data. */
  avg(year: number, key: StatKey): number | null;
  /** Population spread ("step") of a counting stat that year — the ruler for the deviation
      bars. Null for shooting %s (no step) or when the API predates the spread data (migration
      004), in which case the bar falls back to relative-%. */
  stdev(year: number, key: StatKey): number | null;
}

export function makeLeague(seasons: LeagueSeason[]): League {
  const byYear = new Map(seasons.map((s) => [s.year, s]));
  return {
    avg: (year, key) => byYear.get(year)?.[key] ?? null,
    stdev: (year, key) => (isCountingStat(key) ? (byYear.get(year)?.stdev?.[key] ?? null) : null),
  };
}

/** Per-(year, position) average lookup, built from the API's /positions data. */
export interface PositionLookup {
  /** Average of a stat for players at `position` in `year`; null if that (year, position)
      bucket has no row (too small a sample — the API omits it). */
  avg(year: number, position: string, key: StatKey): number | null;
  /** The POSITION's own spread ("step") of a counting stat that (year, position) — position
      bars measure against how this position varies. Null for shooting %s or missing data. */
  stdev(year: number, position: string, key: StatKey): number | null;
}

export function makePositionLookup(seasons: PositionSeason[]): PositionLookup {
  const byKey = new Map(seasons.map((s) => [`${s.year}|${s.position}`, s]));
  return {
    avg: (year, position, key) => byKey.get(`${year}|${position}`)?.[key] ?? null,
    stdev: (year, position, key) =>
      isCountingStat(key) ? (byKey.get(`${year}|${position}`)?.stdev?.[key] ?? null) : null,
  };
}

/** The plain-language plural for a position code, for labels/captions ("other guards"). */
export function positionNoun(position: string | null): string {
  switch (position) {
    case "G":
      return "guards";
    case "F":
      return "forwards";
    case "C":
      return "centers";
    default:
      return "players at the same position";
  }
}

export function fmtV(v: number | null | undefined, pct: boolean): string {
  if (v == null) return "—";
  return pct ? (v * 100).toFixed(1) + "%" : v.toFixed(1);
}

/** The glance form for a heatmap cell. Shooting %s round to a whole percent ("52%"): at cell
    size the tenth is noise and costs width, and the popover + accessible name carry the exact
    `fmtV` value. Counting stats keep their tenth — a 0.4 block would otherwise read as nothing. */
export function fmtCell(v: number | null | undefined, pct: boolean): string {
  if (v == null) return "—";
  return pct ? Math.round(v * 100) + "%" : v.toFixed(1);
}

/** A cell's value as its accessible name says it: what the cell SHOWS first — a spoken name must
    contain the visible label (WCAG 2.5.3; voice-control users say what they see, "click 53%") —
    then the exact value when it says more ("53%, exactly 52.7%"). "31%" for 31.0%, not "31%,
    exactly 31.0%" (craftsmanship review 3.5, 2026-09-26). */
export function spokenValue(cellFmt: string, valueFmt: string): string {
  if (cellFmt === valueFmt || parseFloat(cellFmt) === parseFloat(valueFmt)) return cellFmt;
  return `${cellFmt}, exactly ${valueFmt}`;
}

/** First token of a full name — used to personalize the on-page descriptions ("Paige's
    career average" rather than "the player's"). Falls back to the whole string. */
export function firstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

/** Raw delta in the stat's own units — percentage POINTS for a rate stat ("+0.5" for 34.6% vs
    34.1%), printed without a unit: a " pp" suffix wrapped inside a 40px phone column and the
    abbreviation was not understood; the table's Diff tooltip and the cell's spoken label name the
    unit instead. A gap that rounds to zero has no direction to show: "0.0", not "+0.0" / "−0.0"
    (the sign used to be decided before rounding — A'ja Wilson 2020 blocks read "+0.0"; user,
    2026-09-27). */
export function fmtRaw(r: number, pct: boolean): string {
  const shown = (Math.abs(r) * (pct ? 100 : 1)).toFixed(1);
  if (shown === "0.0") return shown;
  return (r > 0 ? "+" : "−") + shown;
}

/** The difference prints as "0.0" (fmtRaw): no direction, so it's drawn in the muted grey, not the
    above / below color its unrounded sign would pick (user, 2026-09-27). */
export function roundsToZero(r: number, pct: boolean): boolean {
  return fmtRaw(r, pct) === "0.0";
}

export function playedSeasons(player: PlayerDetail): SeasonPlayed[] {
  return player.seasons.filter((x): x is SeasonPlayed => x.played);
}

/** Which of the three games tiers a season falls in: "small" (under a quarter of the games the
    player's team played — grey, not compared), "partial" (up to the rank bar — tinted, marked, not
    ranked), or "full". Both bars scale with the team's games (season.teamGames — the player's own
    team, the last one if traded; the API's rank pool and averages use the same number); both
    compare in exact arithmetic. */
export function gamesTier(season: SeasonPlayed): "small" | "partial" | "full" {
  const games = season.teamGames;
  if (season.gp < COLOR_GAMES_FRACTION * games) return "small";
  if (season.gp * FULL_SCHEDULE_GAMES < QUALIFYING_GAMES * games) return "partial";
  return "full";
}

/** True when a season's games played fall below the color bar for its year — greyed, not compared. */
export function isSmallSample(season: SeasonPlayed): boolean {
  return gamesTier(season) === "small";
}

/** True for a season between the two games bars: tinted and counted, marked, not ranked. */
export function isPartialSeason(season: SeasonPlayed): boolean {
  return gamesTier(season) === "partial";
}

/** Games a season needed to be ranked (and to be in the crowd): ceil(20 × team games ÷ 44). */
export function gamesToRank(season: SeasonPlayed): number {
  return Math.ceil((QUALIFYING_GAMES * season.teamGames) / FULL_SCHEDULE_GAMES);
}

/** The plain-words caveat on a not-normal (asterisked) cell, with the count behind it — the user
    (2026-09-25): say how many games or shots it was, not just "small sample". Null for a full,
    fully-sampled season. Games first (a games-small season is grey for every stat), then the
    stat's shot floor, then the partial tier. A small sample's second sentence names what the grey
    means IN THIS MODE (user: one line per mode, no "the"): self — the season is left out of the
    career average the cells are measured against; league / position — it isn't compared with
    that crowd's average. Both are true everywhere; each mode says the one the reader can see. */
export function sampleNote(season: SeasonPlayed, statKey: StatKey, mode: HeatmapMode, playerPosition: string | null): string | null {
  const small = smallSampleReason(season, statKey);
  if (small != null) {
    const tail = mode === "self" ? "Left out of career average." : `Not compared with ${mode === "league" ? "league" : positionSingular(playerPosition)} average.`;
    return `${small}. ${tail}`;
  }
  if (isPartialSeason(season)) return `Partial season: ${season.gp} of ${season.teamGames} games`;
  return null;
}

/** Why a (season, stat) is a small sample, as the first sentence of its note — "Small sample: 9 of 44
    games" (too few games, any stat) or "Small sample: 29 attempts from three" (too few shots for a
    shooting %) — or null when it isn't one. Non-null exactly when `isStatSmallSample` is true. The
    heatmap footnote adds the mode's tail; the drill-down table's rank dash uses it alone. */
export function smallSampleReason(season: SeasonPlayed, statKey: StatKey): string | null {
  const games = season.teamGames;
  if (isSmallSample(season)) return `Small sample: ${season.gp} of ${games} game${games === 1 ? "" : "s"}`;
  if (!isRateStat(statKey)) return null;
  const att = rateAttempts(season, statKey);
  if (att == null || att >= TINT_FLOOR[statKey]) return null;
  // Round DOWN: only TS attempts are fractional (FGA + 0.44·FTA), and rounding to nearest showed
  // 99.7 as "100 TS attempts" beside a floor of 100 (Teonni Key 2026). Whole counts are unchanged.
  const n = Math.floor(att);
  const s = n === 1 ? "" : "s";
  // Short forms (user, 2026-09-25 — keep the footnote tight). Threes read "attempts from three",
  // not "3-point attempts": "1 3-point attempt" read as "13-point attempt" (user) — a digit, a
  // space, a digit. TS: "TS attempts", basketball's usual name for FGA + 0.44·FTA (true shooting
  // attempts); it said "TS possessions" until 2026-09-27 (user).
  const what = statKey === "tpp" ? `attempt${s} from three` : statKey === "fgp" ? `FG attempt${s}` : `TS attempt${s}`;
  return `Small sample: ${n} ${what}`;
}

/** First letter lowered, for a note joined into a spoken sentence ("2026, small sample: 9 of 44 games"). */
export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** First letter raised, for a noun that starts a label ("career avg" → "Career avg", "forwards" →
    "Forwards"). (data/stats.ts keeps its own copy: the data layer doesn't import this one.) */
export function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The seasons a career average is computed over: those over the COLOR bar (partial seasons count —
    tinted means counted), or every played season when fewer than two are (a one-season career still
    gets a number). Games only — a shooting % pools makes over attempts, so an attempt-thin season
    can't distort it and stays in (a 2-of-5 adds two makes to a 500-attempt pool). */
export function careerBasis(played: SeasonPlayed[]): SeasonPlayed[] {
  const full = played.filter((s) => !isSmallSample(s));
  return full.length >= 2 ? full : played;
}

/** The sample behind a shooting % that season: attempts for FG%/3P%, shooting possessions
    (FGA + 0.44 × FTA) for TS%; null for a counting stat. What the tint floor is measured on. */
function rateAttempts(season: SeasonPlayed, statKey: StatKey): number | null {
  if (statKey === "tsPct") return season.fgAtt + 0.44 * season.ftAtt;
  const pair = RATE_STAT_ATTEMPTS[statKey];
  if (!pair) return null;
  const att = season[pair.att];
  return typeof att === "number" ? att : null;
}

/** Why a compared (tinted) shooting-% season shows no rank, in the reader's words — or null when it
    has one, or when the blank has the same reason a counting stat's would (no position bucket that
    year, or the season is under the games gate). League and self modes: the season is under the
    rank floor. Position mode: the same, or fewer than eight of the position cleared it. */
export function rankNote(s: SeasonPlayed, key: StatKey, mode: HeatmapMode, playerPosition: string | null): string | null {
  if (isSmallSample(s)) return null;
  // A partial season is compared but not in the crowd, so it has no rank for ANY stat; say how many
  // games the year needed. (No note when the mode's crowd doesn't exist for that year either.)
  if (isPartialSeason(s)) {
    return (mode === "position" ? s.posPool : s.pool) == null ? null : `Needs ${gamesToRank(s)} games to rank`;
  }
  if (!isRateStat(key)) return null;
  if (mode === "position") {
    if (s.posPool == null) return null;
    if (s.posRatePool?.[key] == null) return `Fewer than 8 ${positionNoun(playerPosition)} made enough to rank`;
    if (s.posRank?.[key] != null) return null;
  } else {
    if (s.ratePool == null || s.rank?.[key] != null) return null;
  }
  // The API's floor for this season: count × 44 >= floor × team games, i.e. at least
  // ceil(floor × team games / 44).
  const need = (n: number) => Math.ceil((n * s.teamGames) / FULL_SCHEDULE_GAMES);
  const floor = RANK_FLOOR[key];
  const made = floor.made != null ? ` or ${need(floor.made)} made` : "";
  const att = key === "tpp" ? "attempts from three" : key === "fgp" ? "FG attempts" : "TS attempts";
  return `Needs ${need(floor.att)} ${att}${made} to rank`;
}

/** Whether a season is too thin a sample to trust FOR A GIVEN STAT — either too few games
    (any stat) or, for a shooting %, too few attempts of that shot. This is the per-stat gate
    the heatmap cells, the stat chart and its table all read; it supersedes the plain
    games-only isSmallSample everywhere a single (season, stat) value is shown or selected. */
export function isStatSmallSample(season: SeasonPlayed, statKey: StatKey): boolean {
  if (isSmallSample(season)) return true;
  if (!isRateStat(statKey)) return false;
  const att = rateAttempts(season, statKey);
  return att != null && att < TINT_FLOOR[statKey];
}

/** Mean of the non-null values; null when there are none to average. */
function average(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, x) => a + x, 0) / nums.length;
}

/** A player's own average of a stat over some seasons. For a shooting % (fgp/tpp) this POOLS
    the raw makes/attempts — SUM(made)/SUM(att) — so a low-attempt season contributes almost
    nothing (a 1-of-1 = 100% adds 1 make to a big pool, not a full "100%" vote). For a counting
    stat it's the plain per-game mean, unchanged. This mirrors how the backend computes the
    league/position rates, so a player's own baseline and the external ones now agree in method.
    Null when there's no data (no attempts, or no values). */
export function ownStatAverage(statKey: StatKey, seasons: SeasonPlayed[]): number | null {
  if (statKey === "tsPct") {
    // Pooled like the league's: total points over 2 × total shooting possessions.
    let pts = 0;
    let poss = 0;
    for (const s of seasons) {
      pts += s.ptsTotal;
      poss += s.fgAtt + 0.44 * s.ftAtt;
    }
    return poss > 0 ? pts / (2 * poss) : null;
  }
  const pair = RATE_STAT_ATTEMPTS[statKey];
  if (pair) {
    let made = 0;
    let att = 0;
    for (const s of seasons) {
      const m = s[pair.made];
      const a = s[pair.att];
      if (typeof m === "number" && typeof a === "number") {
        made += m;
        att += a;
      }
    }
    return att > 0 ? made / att : null;
  }
  return average(seasons.map((s) => s[statKey]));
}

/** Bar geometry: relative deviation clamped at ±BAR_FULL_SCALE, centered on the baseline.
    The fallback ruler for shooting %s and for pre-004 data with no spread. Retained (with
    stepGeometry) because buildHeatmapGrid reads their signed magnitude for peer-mode cell color. */
function barGeometry(cur: number | null, base: number | null): { up: boolean; barPct: number; leftPct: number } {
  if (cur == null || base == null) return { up: false, barPct: 0, leftPct: 50 };
  const ratio = base ? (cur - base) / base : 0;
  const barPct = +(Math.min(Math.abs(ratio) / BAR_FULL_SCALE, 1) * 50).toFixed(2);
  const up = cur - base >= 0;
  return { up, barPct, leftPct: up ? 50 : 50 - barPct };
}

/** Bar geometry for a counting stat in "steps" — deviation ÷ the comparison group's spread,
    a full bar at FULL_STEPS. This is what stops elite players' bars from all pinning to the
    end and stops small-denominator stats (blocks/steals) from exploding. Returns null when
    there's no usable spread (a shooting %, or data older than migration 004), so the caller
    falls back to barGeometry (relative-%). */
function stepGeometry(
  cur: number | null,
  base: number | null,
  spread: number | null,
): { up: boolean; barPct: number; leftPct: number } | null {
  if (cur == null || base == null || spread == null || spread <= 0) return null;
  const steps = (cur - base) / spread;
  const barPct = +(Math.min(Math.abs(steps) / FULL_STEPS, 1) * 50).toFixed(2);
  const up = cur - base >= 0;
  return { up, barPct, leftPct: up ? 50 : 50 - barPct };
}

// ── Deviation heatmap ─────────────────────────────────────────────────────────
// One season × stat grid with a switchable reference frame. Same red/blue diverging
// scale as the (now-removed) summary bars; the *reference* is the switch.

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** The self-mode color ruler never gets more sensitive than this fraction of the league
    spread, so a stat whose whole career spans a league-trivial range (Kelsey Mitchell's
    blocks) stays pale instead of painting tenths of a block as dramatic. Floor on the own
    range; a player with real swings exceeds it and keeps their vivid trajectory. */
const HEATMAP_STEP_FLOOR = 0.5;

/** What each cell is measured against: the player's own career, their position peers, or
    the whole league — that year in the peer modes. */
export type HeatmapMode = "self" | "position" | "league";

/** One season × one stat in the deviation heatmap. */
export interface HeatmapCell {
  year: number;
  statKey: StatKey;
  pct: boolean;
  /** False → the player missed this season (render an empty gap, not clickable). */
  played: boolean;
  /** The raw stat value that season (null: missed, or no value for this stat). */
  value: number | null;
  /** Exact, one decimal ("51.9%", "26.9") — the popover, and the accessible name after the shown
      value when it differs (`spokenValue`). */
  valueFmt: string;
  /** The glance form drawn in the cell: whole percent for shooting %s ("52%"), else = valueFmt. */
  cellFmt: string;
  /** The reference average this cell is measured against — the career average, or that year's
      league / position average; null when there's none. Shown in the cell popover. */
  refValue: number | null;
  refFmt: string;
  /** value − refValue; null when there's no reference or no value. */
  delta: number | null;
  deltaFmt: string;
  /** −1…1 signed, normalized deviation for the cell color; null → neutral (no reference,
      or a greyed small-sample cell). */
  colorT: number | null;
  up: boolean;
  /** The difference prints as "0.0" — drawn grey, not in the `up` color (roundsToZero). */
  flat: boolean;
  /** Too thin a sample for this stat that season → greyed, not heat-colored, not clickable. */
  smallSample: boolean;
  /** Between the games bars: tinted and counted, but asterisked and not ranked. */
  partial: boolean;
  /** The caveat the asterisk points to ("Partial season: 17 of 44 games"; "Small sample: 29
      attempts from three. Not compared with league average."), null for a normal cell. See sampleNote. */
  note: string | null;
  /** A comparable cell — a played, full-sample season with a value (the ones that get a gap and
      a color). Not an interaction flag: every cell reveals its details, and history is per-stat. */
  selectable: boolean;
}

export interface HeatmapGrid {
  /** Seasons newest-first (grid rows); includes missed years as gaps. */
  years: number[];
  /** rows[yearIndex][statIndex] — parallel to `years` and STATS. */
  rows: HeatmapCell[][];
}

/**
 * Build the full season × stat grid for a reference mode.
 * - **self:** each cell vs. the player's own career average, self-scaled to their own range
 *   (floored at HEATMAP_STEP_FLOOR × the league spread so a trivial range can't saturate).
 * - **league / position:** each cell vs. *that year's* league (or position) average, scaled in
 *   z-score "steps" (deviation ÷ that group's spread, full at FULL_STEPS) — identical semantics
 *   to the old bars, reusing stepGeometry. Shooting %s (no spread) fall back to a relative-% gap.
 */
export function buildHeatmapGrid(
  player: PlayerDetail,
  mode: HeatmapMode,
  league: League,
  positions: PositionLookup | null,
  playerPosition: string | null,
): HeatmapGrid {
  const played = playedSeasons(player);
  const seasons = [...player.seasons].reverse(); // newest-first: latest year on top
  // Reference year for the self-mode league-step floor: the player's latest played season.
  // (The floor only needs a representative league spread magnitude; it's stable across years.)
  const floorYear = played.length ? Math.max(...played.map((s) => s.year)) : (seasons[0]?.year ?? 0);

  // Self mode: per-stat own aggregate (career average + own-range ruler). Mirrors the old
  // CareerHeatmap statAgg. Unused in the peer modes (each cell is independent there).
  const selfAgg = new Map<StatKey, { avg: number | null; maxDev: number }>();
  if (mode === "self") {
    for (const st of STATS) {
      // The average pools every season over the GAMES gate (careerBasis); the own-range ruler uses
      // only the seasons the cells color (the tint floor too), so one attempt-thin season's wild %
      // can't stretch the scale.
      const avg = ownStatAverage(st.key, careerBasis(played));
      const comparable = played.filter((s) => !isStatSmallSample(s, st.key));
      const basis = comparable.length >= 2 ? comparable : played;
      const vals = basis.map((s) => s[st.key]).filter((v): v is number => v != null);
      const ownMaxDev = avg != null && vals.length ? Math.max(...vals.map((v) => Math.abs(v - avg)), 1e-9) : 1;
      const leagueStep = league.stdev(floorYear, st.key);
      const maxDev = leagueStep != null ? Math.max(ownMaxDev, HEATMAP_STEP_FLOOR * leagueStep) : ownMaxDev;
      selfAgg.set(st.key, { avg, maxDev });
    }
  }

  const rows = seasons.map((s) =>
    STATS.map((st): HeatmapCell => {
      const shell = { year: s.year, statKey: st.key, pct: st.pct } as const;
      if (!s.played) {
        return { ...shell, played: false, value: null, valueFmt: "—", cellFmt: "—", refValue: null, refFmt: "—", delta: null, deltaFmt: "—", colorT: null, up: false, flat: false, smallSample: false, partial: false, note: null, selectable: false };
      }
      const value = s[st.key];
      const small = isStatSmallSample(s, st.key);
      const avg =
        mode === "self"
          ? selfAgg.get(st.key)!.avg
          : mode === "position"
            ? (playerPosition != null && positions != null ? positions.avg(s.year, playerPosition, st.key) : null)
            : league.avg(s.year, st.key);

      const scored = value != null && avg != null && !small;
      const delta = scored ? value - avg : null;
      let colorT: number | null = null;
      if (scored) {
        if (mode === "self") {
          colorT = clamp((value - avg) / selfAgg.get(st.key)!.maxDev, -1, 1);
        } else {
          const spread = isCountingStat(st.key)
            ? (mode === "position" ? positions!.stdev(s.year, playerPosition!, st.key) : league.stdev(s.year, st.key))
            : null;
          // Reuse the bars' geometry, then read its signed magnitude back out as a −1…1 ruler.
          const geo = stepGeometry(value, avg, spread) ?? barGeometry(value, avg);
          colorT = (geo.up ? 1 : -1) * (geo.barPct / 50);
        }
      }
      return {
        ...shell,
        played: true,
        value,
        valueFmt: fmtV(value, st.pct),
        cellFmt: fmtCell(value, st.pct),
        refValue: avg,
        refFmt: fmtV(avg, st.pct),
        delta,
        deltaFmt: delta != null ? fmtRaw(delta, st.pct) : "—",
        colorT,
        up: (delta ?? 0) >= 0,
        flat: delta != null && roundsToZero(delta, st.pct),
        smallSample: small,
        partial: isPartialSeason(s),
        note: sampleNote(s, st.key, mode, playerPosition),
        selectable: value != null && !small,
      };
    }),
  );
  return { years: seasons.map((s) => s.year), rows };
}

/** 1 → "1st", 2 → "2nd", 94 → "94th" — for percentile readouts (the reveal strip + the
    drill-down table). Handles the teens: 11th/12th/13th, 111th. */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}


// ── Stat drill-down ───────────────────────────────────────────────────────────
// One stat's year-by-year history beneath the heatmap: a per-season dumbbell (the season's
// value vs. its reference), the comparison group's spread behind it, a career summary, and
// the yearly table. The reference follows the SAME switch as the heatmap — their career, the
// league, or their position — so the two views on one page never quietly disagree. (An
// earlier version compared everything to one "subject" season the reader picked; the heatmap's
// cell popover now carries per-season detail, so the subject and its picker went. DECISIONS.)

/** One column of the chart — EVERY season on the player's timeline, so the x-axis matches the
    heatmap's rows and the table's rows (a missed year is a gap here as it is there). Percent values
    are heights on the chart's 0–100 scale (0 = bottom). */
export interface StatBar {
  year: number;
  yy: string;
  /** What the column draws: a full season (value dot + reference dot + connector); a "small" one
      (a small sample, or a played season with no value) as a hollow dot with its value and no
      reference — shown but not compared, like the heatmap's grey cell; a missed year as an empty
      column ("—"). */
  kind: "full" | "small" | "missed";
  valFmt: string;
  /** The value as printed beside its dot: the heatmap cell's glance form ("14.3", "51%") — a
      column can be under 40px wide, so a shooting % drops its tenth; the table has the exact form. */
  labelFmt: string;
  /** That season's reference, formatted; null when there is none (a position-year with no bucket). */
  baseFmt: string | null;
  /** The value's height. A small-sample value is kept OUT of the axis fit (a 1-of-1 100% would
      squash everything) and clamped just inside the frame instead; null with nothing to draw. */
  hPct: number | null;
  basePct: number | null;
  /** Above (true) or below (false) the reference; null with no reference → a neutral dot. */
  up: boolean | null;
}


export interface StatTableRow {
  year: number;
  min: number | null; // per-game minutes; null ~10% of seasons
  valFmt: string;
  gp: number | null;
  deltaFmt: string;
  deltaColor: string;
  /** Rank that season (1 = best) and the pool it's among — from the API, only for a season that
      qualified. The MODE's crowd: among the player's position in position mode, otherwise the league
      (self mode has no population, so it shows the league rank). A shooting %'s pool is the seasons
      over the rank floor, so it differs from a counting stat's. */
  rank: number | null;
  pool: number | null;
  /** For a compared season with no rank: why, in words ("Needs 19 games to rank" for a partial season,
      "Needs 55 attempts from three or 19 made to rank" for a shooting % under the rank floor). Null
      when ranked, for a small sample (see `note`), or when the mode has no crowd that year. */
  unranked: string | null;
  missed: boolean;
  smallSample: boolean;
  /** For a small-sample (hollow) row: why, in the heatmap footnote's words without the mode's tail
      ("Small sample: 9 of 44 games", "Small sample: 29 attempts from three"). Null otherwise. */
  note: string | null;
  /** A partial season (between the games bars): compared, counted, not ranked. */
  partial: boolean;
  reason?: string;
}

/** The career at a glance for one stat, over the full seasons the chart draws. */
export interface CareerSummary {
  seasons: number;
  high: { fmt: string; year: number };
  low: { fmt: string; year: number };
  /** Career average of this stat (pooled makes/attempts for a shooting %), formatted; "—" if none. */
  careerAvg: string;
  /** Best league rank across full seasons, shown as a rank ("27th of 106") but CHOSEN by the rank's
      share of its pool (27/106 beats 18/65): the league keeps growing, so a bare rank number means
      something different every year. Equal shares go to the larger pool, then the later year.
      Null when no season qualified (for a shooting %, none over the rank floor). */
  bestRank: { rank: number; pool: number; year: number } | null;
}

export interface StatDetail {
  label: string;
  short: string;
  /** True for shooting-percentage stats (no "per game" unit); false for counting stats. */
  pct: boolean;
  /** The word after a summary number, in full: the stat's name for a counting stat ("points",
      "steals"); "%" for a shooting %, whose plate numbers are whole percents ("35" + "%"). The
      plates SHOW `unitShort` and give this one to screen readers. */
  unit: string;
  /** The same word as the plates print it: the stat's box-score code, upper case exactly as the
      heatmap and table headers show it ("14.3 PTS", "1.9 STL") — these are ESPN's own column
      labels (PTS/REB/AST/STL/BLK), codes rather than words, so they carry no singular/plural; in
      lower case they read as words and looked inconsistent ("pts" vs "reb"). "%" for a shooting %. */
  unitShort: string;
  summary: CareerSummary | null;
  /** When the chart can't show a meaningful trend (fewer than 2 trustworthy seasons), this is
      the line the view renders in place of the plot. Null when the chart renders normally. */
  chartFallback: string | null;
  bars: StatBar[];
  tableRows: StatTableRow[];
  /** Y-axis gridline levels: yPct (0 = bottom, 100 = top of scale) + formatted label. */
  axisTicks: { yPct: number; label: string }[];
}

/** "guard" / "forward" / "center" — the singular for labels like "forward avg". */
export function positionSingular(position: string | null): string {
  return ({ G: "guard", F: "forward", C: "center" } as Record<string, string>)[position ?? ""] ?? "position";
}

/** Short noun for a reference, by mode ("career avg" / "league avg" / "center avg") — the scale
    key, the chart legend, and the popover all say the same thing. */
export function scaleNoun(mode: HeatmapMode, position: string | null): string {
  if (mode === "self") return "career avg";
  if (mode === "league") return "league avg";
  return `${positionSingular(position)} avg`;
}

/** The same reference in full words, for a sentence ("their career average", "the league average",
    "the guard average") — a heatmap cell's spoken name and the table's Diff tooltip. `scaleNoun`'s
    "avg" is a label's shorthand; inside a sentence it read like a typo (user, 2026-09-27). */
export function referencePhrase(mode: HeatmapMode, position: string | null): string {
  if (mode === "self") return "their career average";
  if (mode === "league") return "the league average";
  return `the ${positionSingular(position)} average`;
}

/** Self mode needs ≥2 seasons to be meaningful (one season vs. itself is all-neutral); a
    one-season player is offered only the peer modes, and a stray self mode degrades to league. */
export function selfModeAvailable(player: PlayerDetail): boolean {
  return playedSeasons(player).length >= 2;
}

/**
 * The one-line sentence above the heatmap's color key saying what every season is measured
 * against — the mode in words, for a reader who arrives cold. The key beneath it says how the
 * colors read, so this names only the comparison. Position mode names the crowd ("other centers").
 */
export function compareSentence(mode: HeatmapMode, playerFirstName: string, position: string | null): string {
  if (mode === "self") return `Each season against ${playerFirstName}'s own career averages.`;
  if (mode === "league") return "Each season against the league averages of that year.";
  return `Each season against other ${positionNoun(position)} that year.`;
}

/** One segment of the page's "Compare to" control (components/CompareBar.tsx). */
export interface CompareSegment {
  value: HeatmapMode;
  /** Short — the control is a segmented bar, not a dropdown: "Self", "League", "Guards". */
  label: string;
  /** Shown but not selectable, with `reason` as its tooltip. */
  disabled: boolean;
  reason: string | null;
}

/**
 * The three "Compare to" segments, ALWAYS all three so the bar never changes shape from one
 * player to the next. A mode the page can't honor is disabled with the reason: "Self" needs two
 * seasons (one season vs. itself is all-neutral), the position mode needs a position on record
 * (ESPN has none before 2012) and the /positions lookup loaded. The label for the position
 * segment is the crowd itself ("Centers"), or "Position" when there is no position to name.
 */
export function compareSegments(canSelf: boolean, position: string | null, positionsLoaded: boolean): CompareSegment[] {
  const noun = positionNoun(position);
  const positionLabel = position == null ? "Position" : upperFirst(noun);
  const positionReason = position == null ? "No position on record" : positionsLoaded ? null : "Position averages unavailable";
  return [
    // "Self" (user's call, 2026-09-24): "Career" read as career totals; "A'ja vs Self" is the sports
    // idiom, and the sentence above the color key spells out the comparison.
    { value: "self", label: "Self", disabled: !canSelf, reason: canSelf ? null : "Needs two or more seasons" },
    { value: "league", label: "League", disabled: false, reason: null },
    { value: "position", label: positionLabel, disabled: positionReason != null, reason: positionReason },
  ];
}

/**
 * The vertical scale for a SHOOTING-% chart: fitted to the data instead of starting at zero.
 * From zero, a true-shooting career of 42–56% used a fifth of the plot and every gap looked the
 * same. This is a dot chart — the reader compares positions, not bar lengths — so a non-zero
 * floor is honest, and the bottom tick says so ("40%"). Counting stats keep their zero: it is a
 * real floor players sit near (blocks 0.2–0.5).
 *
 * Rules, in tenths of a percentage point (integers, so no float drift):
 *  - covers every value passed (the player's seasons AND the reference dots), with at least one
 *    point of clearance so no dot sits on the frame;
 *  - ends snap to whole fives and the span to a whole ten, so the three ticks read "40% 50% 60%";
 *  - never narrower than 20 points — a pure fit would stretch a 55→56% career across the whole
 *    plot; with the floor a one-point gap stays small;
 *  - the TOP value sits no higher than LABEL_HEADROOM of the span, so its value label (printed
 *    above the dot) stays under the top gridline — one point of clearance was nothing on a
 *    60-point span (Nneka Ogwumike's 3P%: 62% on a 5–65% axis put the label 10px above the frame);
 *  - grows toward the side with less room (ties go up, as headroom), never below 0%.
 */
export function pctAxis(values: number[]): { lo: number; hi: number } {
  if (values.length === 0) return { lo: 0, hi: 1 };
  const t = values.map((v) => Math.round(v * 1000));
  const tmin = Math.min(...t);
  const tmax = Math.max(...t);
  let lo = Math.max(0, Math.floor((tmin - 10) / 50) * 50);
  let hi = Math.ceil((tmax + 10) / 50) * 50;
  for (;;) {
    const span = hi - lo;
    if (span < 200 || span % 100 !== 0) {
      if (tmin - lo < hi - tmax && lo >= 50) lo -= 50;
      else hi += 50;
    } else if (tmax - lo > LABEL_HEADROOM * span) {
      hi += 50;
    } else break;
  }
  return { lo: lo / 1000, hi: hi / 1000 };
}

/** The highest share of the plot's height a value dot may sit at and still have room for its
    label above it: the label sits LABEL_GAP (12px) above the dot's centre and is ~11px tall, on a
    220px plot → 23/220 ≈ 10.5% must stay free (both numbers live in StatDrilldownView). Used by the
    fitted % axis and to clamp a small-sample dot; a counting stat's 1.2× headroom (top at 83%)
    already satisfies it. */
export const LABEL_HEADROOM = 0.88;

export function buildStatDetail(
  player: PlayerDetail,
  stat: StatDef,
  mode: HeatmapMode,
  league: League,
  positions: PositionLookup | null,
  playerPosition: string | null,
): StatDetail {
  const key = stat.key;
  const allPlayed = playedSeasons(player);
  const small = (s: SeasonPlayed) => isStatSmallSample(s, key);

  // The chart shows only trustworthy seasons: played, with a value for this stat, and NOT a small
  // sample (too few games, or too few attempts for a shooting %). Noise never reaches the plot;
  // the table below keeps the full record.
  const chartable = allPlayed.filter((s) => s[key] != null && !small(s));

  // Career average on the SAME basis the heatmap's self mode uses (seasons over the games gate;
  // every played season if fewer than two are), so the plate and the self-mode cells agree.
  const careerAvg = ownStatAverage(key, careerBasis(allPlayed));

  const posOk = playerPosition != null && positions != null;
  const refFor = (year: number): number | null =>
    mode === "self" ? careerAvg : mode === "position" ? (posOk ? positions.avg(year, playerPosition, key) : null) : league.avg(year, key);
  // The rank and its pool for the MODE's crowd: the player's position in position mode, otherwise
  // the league (self mode compares to the player's own career — no population — so it keeps the
  // league rank, as the table did all along).
  // A shooting % ranks in its own, smaller pool (the seasons over the rank floor).
  const rankOf = (s: SeasonPlayed): number | null => (mode === "position" ? s.posRank?.[key] : s.rank?.[key]) ?? null;
  const poolOf = (s: SeasonPlayed): number | null =>
    (isRateStat(key) ? (mode === "position" ? s.posRatePool?.[key] : s.ratePool?.[key]) : mode === "position" ? s.posPool : s.pool) ?? null;

  // Scale spans everything the plot draws — the charted values and their references — so nothing
  // clips. A counting stat runs from ZERO to 1.2× the top (headroom); a shooting % gets a fitted
  // axis (see pctAxis: from zero its data used a sliver of the plot).
  const drawn = chartable.flatMap((s) => [s[key] as number, refFor(s.year)]).filter((v): v is number => v != null);
  const axis = stat.pct ? pctAxis(drawn) : { lo: 0, hi: Math.max(...drawn, 0) * 1.2 || 1 };
  const pctOf = (v: number) => +(((v - axis.lo) / (axis.hi - axis.lo)) * 100).toFixed(2);
  const clamp = (h: number) => Math.min(LABEL_HEADROOM * 100, Math.max(5, h));

  const bars: StatBar[] = player.seasons.map((s) => {
    const yy = String(s.year).slice(2);
    if (!s.played) return { year: s.year, yy, kind: "missed", valFmt: "—", labelFmt: "", baseFmt: null, hPct: null, basePct: null, up: null };
    const v = s[key];
    if (v == null || small(s)) {
      return { year: s.year, yy, kind: "small", valFmt: fmtV(v, stat.pct), labelFmt: v == null ? "" : fmtCell(v, stat.pct), baseFmt: null, hPct: v == null ? null : clamp(pctOf(v)), basePct: null, up: null };
    }
    const b = refFor(s.year);
    return {
      year: s.year,
      yy,
      kind: "full",
      valFmt: fmtV(v, stat.pct),
      labelFmt: fmtCell(v, stat.pct),
      baseFmt: b != null ? fmtV(b, stat.pct) : null,
      hPct: pctOf(v),
      basePct: b != null ? pctOf(b) : null,
      up: b != null ? v >= b : null,
    };
  });

  // Fewer than 2 trustworthy seasons → no meaningful trend to draw (a one-season player, two
  // seasons that are both too short, a player who almost never shoots threes). The view shows this
  // line instead of the plot; the table still lists every season. One line for every stat and
  // every cause (user, 2026-09-26): "Not enough seasons" read wrong for a player with two hollow
  // seasons, and the cause is on the hollow cells' tips.
  const chartFallback = chartable.length < 2 ? "Not enough data to chart a trend." : null;

  const tableRows: StatTableRow[] = player.seasons.map((x) => {
    if (!x.played) {
      return { year: x.year, min: null, valFmt: "—", gp: null, deltaFmt: "—", deltaColor: "var(--color-neutral-700)", rank: null, pool: null, unranked: null, missed: true, smallSample: false, note: null, partial: false, reason: x.reason };
    }
    const v = x[key];
    const b = refFor(x.year);
    const sm = small(x);
    // Suppress the delta on a small-sample row — a "+64%" off a 1-of-1 season is exactly the
    // noise hidden everywhere else. The value + makes/attempts still show, so the reader sees
    // both the number and why it's untrustworthy.
    const hasDelta = !sm && v != null && b != null;
    return {
      year: x.year,
      min: x.min,
      valFmt: fmtV(v, stat.pct),
      gp: x.gp,
      deltaFmt: hasDelta ? fmtRaw(v - b, stat.pct) : "—",
      // Grey when there's no direction to show: a "—" (nothing to compare) or a "0.0". The dash took
      // the below color until 2026-09-27.
      deltaColor: !hasDelta || roundsToZero(v - b, stat.pct) ? "var(--color-text-muted)" : v - b > 0 ? "var(--hm-above-text)" : "var(--hm-below-text)",
      rank: sm ? null : rankOf(x),
      pool: poolOf(x),
      unranked: sm ? null : rankNote(x, key, mode, playerPosition),
      missed: false,
      smallSample: sm,
      note: sm ? smallSampleReason(x, key) : null,
      partial: isPartialSeason(x),
    };
  });

  // The career at a glance, over the same full seasons the chart draws. Plate numbers: one decimal
  // for a counting stat; a WHOLE percent for a shooting % (the sign is rendered as the word after
  // the number) — the chart and table keep the exact one-decimal form.
  const plateFmt = (v: number | null): string => (v == null ? "—" : stat.pct ? String(Math.round(v * 100)) : v.toFixed(1));
  let summary: CareerSummary | null = null;
  if (chartable.length > 0) {
    const val = (s: SeasonPlayed) => s[key] as number;
    const high = chartable.reduce((a, s) => (val(s) > val(a) ? s : a));
    const low = chartable.reduce((a, s) => (val(s) < val(a) ? s : a));
    const ranked = chartable.filter((s) => rankOf(s) != null && poolOf(s) != null);
    // Best = the smallest SHARE of the pool (rank ÷ pool), not the smallest rank number: 18th of
    // 65 is the top 28%, 27th of 106 the top 25%, and the pool grows as the league adds teams.
    // Compared by cross-multiplying (r·poolA vs rA·pool) so equal shares are exactly equal — no
    // float division. Equal shares go to the larger pool (the more complete fact), then the later year.
    const best = ranked.reduce<SeasonPlayed | null>((a, s) => {
      if (a == null) return s;
      const r = rankOf(s) as number, ra = rankOf(a) as number;
      const p = poolOf(s) as number, pa = poolOf(a) as number;
      const lhs = r * pa, rhs = ra * p;
      return lhs < rhs || (lhs === rhs && (p > pa || (p === pa && s.year > a.year))) ? s : a;
    }, null);
    summary = {
      seasons: chartable.length,
      high: { fmt: plateFmt(val(high)), year: high.year },
      low: { fmt: plateFmt(val(low)), year: low.year },
      careerAvg: plateFmt(careerAvg),
      bestRank: best ? { rank: rankOf(best) as number, pool: poolOf(best) as number, year: best.year } : null,
    };
  }

  return {
    label: stat.label,
    short: stat.short,
    pct: stat.pct,
    unit: stat.pct ? "%" : stat.label.toLowerCase(),
    unitShort: stat.pct ? "%" : stat.short,
    summary,
    chartFallback,
    bars,
    // Table lists newest season first; the chart stays left-to-right chronological.
    tableRows: [...tableRows].reverse(),
    // A fitted % axis lands on whole fives, so its labels drop the tenth ("40%", not "40.0%").
    axisTicks: [0, 50, 100].map((yPct) => {
      const v = axis.lo + ((axis.hi - axis.lo) * yPct) / 100;
      return { yPct, label: stat.pct ? `${Math.round(v * 100)}%` : fmtV(v, false) };
    }),
  };
}
