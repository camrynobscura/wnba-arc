import { STATS, type StatDef } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, SeasonPlayed } from "../data/api";

// Every comparison on the page, in the heatmap and the stat detail below it, measures a season against
// one switchable reference (HeatmapMode): the player's career, the league, or their position that year.

/** The "played enough to count" bar: a season qualifies at QUALIFYING_GAMES of a FULL_SCHEDULE_GAMES-game
    schedule, scaled to the team's games that year (20 of 44 today, 13 of 28 in 1997). It's
    Basketball-Reference's WNBA per-game requirement, scaled so a short season isn't judged by a long
    one's bar, and compared in integers (gp × FULL < QUALIFYING × team games). Must equal wnba-data's pair
    (src/db/computeLeague.ts), which uses the same bar to pick who counts toward the league averages,
    spreads and ranks. */
export const QUALIFYING_GAMES = 20;
export const FULL_SCHEDULE_GAMES = 44;
/** The lower games bar: enough games to color a row, a quarter of the team's games (11 of 44). Between
    this and QUALIFYING_GAMES a season is "partial": colored and counted in the career average, marked
    with an asterisk, and not ranked. It's measured against the full-season crowd without being in it. */
export const COLOR_GAMES_FRACTION = 0.25;
/** Full color for a shooting %: this relative gap above or below the reference. Also the fallback for a
    counting stat when the API sends no spread. */
const BAR_FULL_SCALE = 0.5;
/** Full color for a counting stat against the league or a position: this many standard deviations of
    that group. 3 already means almost nobody is out there, so rarer seasons simply clip. */
const FULL_STEPS = 3;

/** Enough shots to color a shooting-% cell: FG attempts for FG%, three-point attempts for 3P%, TS
    attempts (FGA + 0.44 × FTA) for TS%. Fixed counts, not scaled to the schedule: the question is whether
    the percentage is stable, and at these floors one make moves it by 2.5 points (3P%) or 1 point (FG%,
    TS%). Separate from the games bar: a full season can still be thin on attempts. */
const TINT_FLOOR: Record<RateKey, number> = { fgp: 100, tpp: 40, tsPct: 100 };
/** Enough shots to rank a shooting %, per 44 team games: attempts or makes. A copy of the API's floor
    (wnba-data src/api/queries.ts RATE_RANK_FLOOR), used only to word the note on a colored cell that
    falls short ("Needs 55 attempts from three or 19 made to rank"); the rank itself always comes from
    the API. The API's pool also requires TINT_FLOOR (its RATE_TINT_FLOOR), so a ranked season is always
    a colored one. Keep all three in step. */
const RANK_FLOOR: Record<RateKey, { att: number; made?: number }> = {
  fgp: { att: 200, made: 85 },
  tpp: { att: 60, made: 20 },
  tsPct: { att: 125 },
};

/** Where each make/attempt shooting % finds its pair on a season. TS% isn't one pair: rateAttempts and
    ownStatAverage build it from points, FGA and FTA. */
const RATE_STAT_ATTEMPTS: Partial<Record<StatKey, { made: keyof SeasonPlayed; att: keyof SeasonPlayed }>> = {
  fgp: { made: "fgMade", att: "fgAtt" },
  tpp: { made: "fg3Made", att: "fg3Att" },
};

export type StatKey = StatDef["key"];
/** The three shooting percentages: they have a tint floor, rank in their own pool, and pool their
    career average from totals. */
export type RateKey = Extract<StatKey, "fgp" | "tpp" | "tsPct">;
export function isRateStat(key: StatKey): key is RateKey {
  return key === "fgp" || key === "tpp" || key === "tsPct";
}

/** The five counting stats, measured in standard deviations (the shooting %s use a relative gap). */
const COUNTING_KEYS = ["pts", "reb", "ast", "stl", "blk"] as const;
type CountingKey = (typeof COUNTING_KEYS)[number];
export function isCountingStat(key: StatKey): key is CountingKey {
  return (COUNTING_KEYS as readonly string[]).includes(key);
}

/**
 * Per-year league lookups from the API's /league data. (The games bars don't come from here: each season
 * carries its own team's games, SeasonPlayed.teamGames.)
 */
export interface League {
  avg(year: number, key: StatKey): number | null;
  /** Population standard deviation of a counting stat that year. Null for shooting %s, or when the API
      sends none (the color then falls back to the relative gap). */
  stdev(year: number, key: StatKey): number | null;
}

export function makeLeague(seasons: LeagueSeason[]): League {
  const byYear = new Map(seasons.map((s) => [s.year, s]));
  return {
    avg: (year, key) => byYear.get(year)?.[key] ?? null,
    stdev: (year, key) => (isCountingStat(key) ? (byYear.get(year)?.stdev?.[key] ?? null) : null),
  };
}

export interface PositionLookup {
  /** Average of a stat for players at `position` in `year`; null when that group was too small (the API
      omits it). */
  avg(year: number, position: string, key: StatKey): number | null;
  /** The position's own standard deviation of a counting stat that year; null for shooting %s or
      missing data. */
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

/** The word for a position code ("C" → "center"); null for no position or an unknown code.
    positionNoun, positionSingular and the spoken meta line (playerMeta.ts) all build on it. */
export function positionName(position: string | null): string | null {
  // A switch: an object lookup would also find inherited keys ("constructor", "__proto__") if the API ever
  // sent one as a position.
  switch (position) {
    case "G":
      return "guard";
    case "F":
      return "forward";
    case "C":
      return "center";
    default:
      return null;
  }
}

export function positionNoun(position: string | null): string {
  const name = positionName(position);
  return name ? `${name}s` : "players at the same position";
}

export function fmtV(v: number | null | undefined, pct: boolean): string {
  if (v == null) return "—";
  return pct ? (v * 100).toFixed(1) + "%" : v.toFixed(1);
}

/** A heatmap cell's glance form. Shooting %s round to a whole percent ("52%"): at cell size the tenth
    costs width, and the popover and spoken name carry the exact value. Counting stats keep their tenth,
    or 0.4 blocks would read as nothing. */
export function fmtCell(v: number | null | undefined, pct: boolean): string {
  if (v == null) return "—";
  return pct ? Math.round(v * 100) + "%" : v.toFixed(1);
}

/** A cell's value as its accessible name says it: what the cell shows first, since a spoken name must
    contain the visible label (WCAG 2.5.3: voice-control users say what they see, "click 53%"), then the
    exact value when it says more ("53%, exactly 52.7%"). "31%" for 31.0%. */
export function spokenValue(cellFmt: string, valueFmt: string): string {
  if (cellFmt === valueFmt || parseFloat(cellFmt) === parseFloat(valueFmt)) return cellFmt;
  return `${cellFmt}, exactly ${valueFmt}`;
}

export function firstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

/** The gap in the stat's own units, percentage points for a shooting % ("+0.5" for 34.6% vs 34.1%),
    printed without a unit: a " pp" suffix wrapped in a phone column and wasn't understood, so the
    tooltips and spoken names say the unit. A gap that rounds to zero has no direction: "0.0", not
    "+0.0". */
export function fmtRaw(r: number, pct: boolean): string {
  const shown = (Math.abs(r) * (pct ? 100 : 1)).toFixed(1);
  if (shown === "0.0") return shown;
  return (r > 0 ? "+" : "−") + shown;
}

/** The gap prints as "0.0" (fmtRaw): no direction, so it's drawn grey, not in the color its unrounded
    sign would pick. */
export function roundsToZero(r: number, pct: boolean): boolean {
  return fmtRaw(r, pct) === "0.0";
}

export function playedSeasons(player: PlayerDetail): SeasonPlayed[] {
  return player.seasons.filter((x): x is SeasonPlayed => x.played);
}

/** Which games tier a season is in: "small" (under a quarter of its team's games: grey, not compared),
    "partial" (short of the rank bar: colored, marked, not ranked) or "full". Both bars scale with the
    team's games (the last team, if traded), the same number the API's averages and ranks use. */
export function gamesTier(season: SeasonPlayed): "small" | "partial" | "full" {
  const games = season.teamGames;
  if (season.gp < COLOR_GAMES_FRACTION * games) return "small";
  if (season.gp * FULL_SCHEDULE_GAMES < QUALIFYING_GAMES * games) return "partial";
  return "full";
}

export function isSmallSample(season: SeasonPlayed): boolean {
  return gamesTier(season) === "small";
}

export function isPartialSeason(season: SeasonPlayed): boolean {
  return gamesTier(season) === "partial";
}

/** Games a season needed to be ranked: ceil(20 × team games ÷ 44). */
export function gamesToRank(season: SeasonPlayed): number {
  return Math.ceil((QUALIFYING_GAMES * season.teamGames) / FULL_SCHEDULE_GAMES);
}

/** The caveat on a marked cell, with the count behind it; null for a normal season. Games first (too few
    games greys every stat), then the stat's shot floor, then the partial tier. A small sample's second
    sentence says what the grey means in the current mode: left out of the career average (self), or not
    compared with that crowd's average (league, position). */
export function sampleNote(
  season: SeasonPlayed,
  statKey: StatKey,
  mode: HeatmapMode,
  playerPosition: string | null,
): string | null {
  const small = smallSampleReason(season, statKey);
  if (small != null) {
    const tail =
      mode === "self"
        ? "Left out of career average."
        : `Not compared with ${mode === "league" ? "league" : positionSingular(playerPosition)} average.`;
    return `${small}. ${tail}`;
  }
  if (isPartialSeason(season)) return `Partial season: ${season.gp} of ${season.teamGames} games`;
  return null;
}

/** Why a (season, stat) is a small sample, as the first sentence of its note ("Small sample: 9 of 44
    games", "Small sample: 29 attempts from three"), or null when it isn't one. Non-null exactly when
    `isStatSmallSample` is true. The heatmap adds the mode's sentence; the table's rank dash uses it
    alone. */
export function smallSampleReason(season: SeasonPlayed, statKey: StatKey): string | null {
  const games = season.teamGames;
  if (isSmallSample(season)) return `Small sample: ${season.gp} of ${games} game${games === 1 ? "" : "s"}`;
  if (!isRateStat(statKey)) return null;
  const att = rateAttempts(season, statKey);
  if (att == null || att >= TINT_FLOOR[statKey]) return null;
  // Round down: TS attempts are fractional (FGA + 0.44 × FTA), and rounding to nearest showed 99.7 as
  // "100 TS attempts" beside a floor of 100.
  const n = Math.floor(att);
  const s = n === 1 ? "" : "s";
  // "attempts from three", not "3-point attempts": "1 3-point attempt" reads as "13-point attempt".
  const what = statKey === "tpp" ? `attempt${s} from three` : statKey === "fgp" ? `FG attempt${s}` : `TS attempt${s}`;
  return `Small sample: ${n} ${what}`;
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** data/stats.ts keeps its own copy: the data layer doesn't import this one. */
export function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The seasons a career average uses: those over the color bar (partial seasons count), or every played
    season when fewer than two are, so a one-season career still gets a number. Games only: a shooting %
    pools makes over attempts, so a season thin on attempts can't distort it. */
export function careerBasis(played: SeasonPlayed[]): SeasonPlayed[] {
  const full = played.filter((s) => !isSmallSample(s));
  return full.length >= 2 ? full : played;
}

/** The sample behind a shooting % that season: attempts for FG% and 3P%, TS attempts for TS%; null for a
    counting stat. */
function rateAttempts(season: SeasonPlayed, statKey: StatKey): number | null {
  if (statKey === "tsPct") return season.fgAtt + 0.44 * season.ftAtt;
  const pair = RATE_STAT_ATTEMPTS[statKey];
  if (!pair) return null;
  const att = season[pair.att];
  return typeof att === "number" ? att : null;
}

/** Why a colored season has no rank, in the reader's words, or null when it has one or when the blank
    means the same as a counting stat's (no position group that year, or under the games bar). League and
    self modes: the season is under the rank floor. Position mode: the same, or fewer than eight of the
    position cleared it. */
export function rankNote(
  s: SeasonPlayed,
  key: StatKey,
  mode: HeatmapMode,
  playerPosition: string | null,
): string | null {
  if (isSmallSample(s)) return null;
  // A partial season is compared but not in the crowd, so it has no rank for any stat. (No note when the
  // mode has no crowd that year either.)
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
  // The API's floor: count × 44 >= floor × team games.
  const need = (n: number) => Math.ceil((n * s.teamGames) / FULL_SCHEDULE_GAMES);
  const floor = RANK_FLOOR[key];
  const made = floor.made != null ? ` or ${need(floor.made)} made` : "";
  const att = key === "tpp" ? "attempts from three" : key === "fgp" ? "FG attempts" : "TS attempts";
  return `Needs ${need(floor.att)} ${att}${made} to rank`;
}

/** Too thin a sample to trust for this stat: too few games, or, for a shooting %, too few attempts of
    that shot. The gate the heatmap, the chart and the table all read. */
export function isStatSmallSample(season: SeasonPlayed, statKey: StatKey): boolean {
  if (isSmallSample(season)) return true;
  if (!isRateStat(statKey)) return false;
  const att = rateAttempts(season, statKey);
  return att != null && att < TINT_FLOOR[statKey];
}

function average(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, x) => a + x, 0) / nums.length;
}

/** A player's own average of a stat. A shooting % pools makes over attempts (SUM(made) / SUM(att)), so a
    1-of-1 season adds one make, not a full "100%" vote; the backend computes the league and position
    rates the same way. A counting stat is the plain per-game mean. Null with no data. */
export function ownStatAverage(statKey: StatKey, seasons: SeasonPlayed[]): number | null {
  if (statKey === "tsPct") {
    // Pooled like the league's: total points over 2 × total TS attempts.
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

/** Color strength from the relative gap, clamped at ±BAR_FULL_SCALE: the ruler for shooting %s, and the
    fallback when there's no spread. (The bar-shaped result is from the deviation bars these first drew;
    buildHeatmapGrid reads its signed size.) */
function barGeometry(cur: number | null, base: number | null): { up: boolean; barPct: number; leftPct: number } {
  if (cur == null || base == null) return { up: false, barPct: 0, leftPct: 50 };
  const ratio = base ? (cur - base) / base : 0;
  const barPct = +(Math.min(Math.abs(ratio) / BAR_FULL_SCALE, 1) * 50).toFixed(2);
  const up = cur - base >= 0;
  return { up, barPct, leftPct: up ? 50 : 50 - barPct };
}

/** The same for a counting stat, in standard deviations of the comparison group, full at FULL_STEPS. This
    keeps stars from maxing out every stat and small stats (blocks, steals) from exploding. Null with no
    usable spread, so the caller falls back to barGeometry. */
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
// One season × stat grid, measured against the chosen reference.

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Self mode's color ruler is never finer than this fraction of the league's spread, so a stat whose
    whole career spans a trivial range (a guard's blocks) stays pale instead of painting tenths of a
    block as dramatic. A player with real swings exceeds it and keeps their full range. */
const HEATMAP_STEP_FLOOR = 0.5;

export type HeatmapMode = "self" | "position" | "league";

export interface HeatmapCell {
  year: number;
  statKey: StatKey;
  pct: boolean;
  played: boolean;
  value: number | null;
  /** Exact, one decimal ("51.9%", "26.9"): the popover, and the spoken name when it differs from the
      cell (`spokenValue`). */
  valueFmt: string;
  /** The glance form drawn in the cell: a whole percent for shooting %s ("52%"), else = valueFmt. */
  cellFmt: string;
  refValue: number | null;
  refFmt: string;
  delta: number | null;
  deltaFmt: string;
  /** −1…1 signed color strength; null → neutral (no reference, or a grey small-sample cell). */
  colorT: number | null;
  up: boolean;
  /** The gap prints as "0.0": drawn grey, not in the `up` color (roundsToZero). */
  flat: boolean;
  smallSample: boolean;
  partial: boolean;
  /** The caveat the asterisk points to ("Partial season: 17 of 44 games"), null for a normal cell. See
      sampleNote. */
  note: string | null;
  /** A comparable cell: played, a full sample, with a value (it gets a gap and a color). Not an
      interaction flag: every cell opens its details. */
  selectable: boolean;
}

export interface HeatmapGrid {
  /** Seasons newest-first (grid rows); includes missed years as gaps. */
  years: number[];
  /** rows[yearIndex][statIndex], parallel to `years` and STATS. */
  rows: HeatmapCell[][];
}

/**
 * Build the full season × stat grid for a reference mode.
 * - **self:** each cell vs. the player's own career average, scaled to their own range (floored at
 *   HEATMAP_STEP_FLOOR × the league spread, so a trivial range can't saturate).
 * - **league / position:** each cell vs. that year's league (or position) average, in standard
 *   deviations of that group (full at FULL_STEPS). Shooting %s have no spread and use the relative gap.
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
  // The self-mode floor needs a representative league spread; the latest played season's will do.
  const floorYear = played.length ? Math.max(...played.map((s) => s.year)) : (seasons[0]?.year ?? 0);

  // Self mode: each stat's career average and own-range ruler. Unused in the peer modes, where each cell
  // stands alone.
  const selfAgg = new Map<StatKey, { avg: number | null; maxDev: number }>();
  if (mode === "self") {
    for (const st of STATS) {
      // The average uses every season over the games bar (careerBasis); the ruler uses only the seasons
      // the cells color, so one season thin on attempts can't stretch the scale with a wild %.
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
        return {
          ...shell,
          played: false,
          value: null,
          valueFmt: "—",
          cellFmt: "—",
          refValue: null,
          refFmt: "—",
          delta: null,
          deltaFmt: "—",
          colorT: null,
          up: false,
          flat: false,
          smallSample: false,
          partial: false,
          note: null,
          selectable: false,
        };
      }
      const value = s[st.key];
      const small = isStatSmallSample(s, st.key);
      const avg =
        mode === "self"
          ? selfAgg.get(st.key)!.avg
          : mode === "position"
            ? playerPosition != null && positions != null
              ? positions.avg(s.year, playerPosition, st.key)
              : null
            : league.avg(s.year, st.key);

      const scored = value != null && avg != null && !small;
      const delta = scored ? value - avg : null;
      let colorT: number | null = null;
      if (scored) {
        if (mode === "self") {
          colorT = clamp((value - avg) / selfAgg.get(st.key)!.maxDev, -1, 1);
        } else {
          const spread = isCountingStat(st.key)
            ? mode === "position"
              ? positions!.stdev(s.year, playerPosition!, st.key)
              : league.stdev(s.year, st.key)
            : null;
          // The geometry's signed size, read back as a −1…1 color strength.
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

/** 1 → "1st", 2 → "2nd", 94 → "94th", with the teens handled (11th, 12th, 111th). */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// ── Stat detail ───────────────────────────────────────────────────────────────
// One stat's season-by-season history under the heatmap: the chart (each season's value against its
// reference), a career summary and the yearly table. It follows the heatmap's reference switch, so the
// two never disagree.

/** One chart column for every season on the player's timeline, so the x-axis matches the heatmap's rows
    and the table's (a missed year is a gap in all three). Percent values are heights on the chart's
    0–100 scale (0 = bottom). */
export interface StatBar {
  year: number;
  yy: string;
  /** "full": value dot, reference dot and connector. "small": a small sample, or a played season with no
      value, drawn as a hollow dot with no reference, like the heatmap's grey cell. "missed": an empty
      column. */
  kind: "full" | "small" | "missed";
  valFmt: string;
  /** The number beside the dot, in the heatmap cell's glance form ("14.3", "51%"): a column can be under
      40px wide. The table has the exact form. */
  labelFmt: string;
  baseFmt: string | null;
  /** The value's height. A small sample's value is kept out of the axis fit (a 1-of-1 100% would squash
      everything) and clamped inside the frame instead; null with nothing to draw. */
  hPct: number | null;
  basePct: number | null;
  /** Above (true) or below (false) the reference; null with no reference → a neutral dot. */
  up: boolean | null;
}

export interface StatTableRow {
  year: number;
  min: number | null; // minutes per game; missing for some seasons
  valFmt: string;
  gp: number | null;
  deltaFmt: string;
  deltaColor: string;
  /** Rank that season (1 = best) and its pool, from the API, only for a season that qualified. The mode's
      crowd: the player's position in position mode, otherwise the league (self mode has no crowd, so it
      shows the league rank). A shooting %'s pool is the seasons over the rank floor. */
  rank: number | null;
  pool: number | null;
  /** Why a compared season has no rank ("Needs 19 games to rank", "Needs 55 attempts from three or 19
      made to rank"). Null when ranked, for a small sample (see `note`), or when the mode has no crowd
      that year. */
  unranked: string | null;
  missed: boolean;
  smallSample: boolean;
  /** For a small-sample (hollow) row, why, in the heatmap note's words without the mode's sentence
      ("Small sample: 9 of 44 games"). Null otherwise. */
  note: string | null;
  partial: boolean;
  reason?: string;
}

export interface CareerSummary {
  seasons: number;
  high: { fmt: string; year: number };
  low: { fmt: string; year: number };
  careerAvg: string;
  /** Best league rank, shown as a rank ("27th of 106") but chosen by its share of the pool (27/106 beats
      18/65): the league keeps growing, so a bare rank means something different every year. Equal shares
      go to the larger pool, then the later year. Null when no season qualified. */
  bestRank: { rank: number; pool: number; year: number } | null;
}

export interface StatDetail {
  label: string;
  short: string;
  pct: boolean;
  /** The word after a summary number, for screen readers: the stat's name ("points") or "%" for a
      shooting %, whose plate numbers are whole percents ("35" + "%"). */
  unit: string;
  /** The same word as the plates print it: the stat's box-score code as the headers show it ("14.3 PTS",
      "1.9 STL"), or "%". */
  unitShort: string;
  summary: CareerSummary | null;
  /** The line shown in place of the chart when there's no trend to draw (fewer than two trustworthy
      seasons); null when the chart renders. */
  chartFallback: string | null;
  bars: StatBar[];
  tableRows: StatTableRow[];
  /** yPct: 0 = bottom, 100 = top. */
  axisTicks: { yPct: number; label: string }[];
}

export function positionSingular(position: string | null): string {
  return positionName(position) ?? "position";
}

/** Short noun for a reference, by mode ("career avg" / "league avg" / "center avg"): the scale key, the
    chart legend and the popover all say the same thing. */
export function scaleNoun(mode: HeatmapMode, position: string | null): string {
  if (mode === "self") return "career avg";
  if (mode === "league") return "league avg";
  return `${positionSingular(position)} avg`;
}

/** The same reference in full words, for a sentence ("their career average", "the league average"): a
    heatmap cell's spoken name and the table's Diff tooltip. Inside a sentence, "avg" reads like a typo. */
export function referencePhrase(mode: HeatmapMode, position: string | null): string {
  if (mode === "self") return "their career average";
  if (mode === "league") return "the league average";
  return `the ${positionSingular(position)} average`;
}

/** Self mode needs two or more seasons (one season against itself is all neutral); a one-season player
    gets the league and position modes only. */
export function selfModeAvailable(player: PlayerDetail): boolean {
  return playedSeasons(player).length >= 2;
}

/**
 * The sentence above the heatmap's color key: what every season is measured against, for a reader who
 * arrives cold. The key says how the colors read, so this names only the comparison.
 */
export function compareSentence(mode: HeatmapMode, playerFirstName: string, position: string | null): string {
  if (mode === "self") return `Each season against ${playerFirstName}'s own career averages.`;
  if (mode === "league") return "Each season against the league averages of that year.";
  return `Each season against other ${positionNoun(position)} that year.`;
}

export interface CompareSegment {
  value: HeatmapMode;
  label: string;
  /** Shown but not selectable, with `reason` as its tooltip. */
  disabled: boolean;
  reason: string | null;
}

/**
 * The three "Compare to" segments, always all three so the bar never changes shape between players. A
 * mode the page can't offer is disabled with its reason: "Self" needs two seasons, and the position mode
 * needs a position on record (ESPN has none for most players before 2012) and the /positions data. The
 * position segment names the crowd ("Centers"), or "Position" when there's none to name.
 */
export function compareSegments(canSelf: boolean, position: string | null, positionsLoaded: boolean): CompareSegment[] {
  const noun = positionNoun(position);
  const positionLabel = position == null ? "Position" : upperFirst(noun);
  const positionReason =
    position == null ? "No position on record" : positionsLoaded ? null : "Position averages unavailable";
  return [
    // "Self", not "Career", which read as career totals.
    { value: "self", label: "Self", disabled: !canSelf, reason: canSelf ? null : "Needs two or more seasons" },
    { value: "league", label: "League", disabled: false, reason: null },
    { value: "position", label: positionLabel, disabled: positionReason != null, reason: positionReason },
  ];
}

/**
 * The vertical scale for a shooting-% chart, fitted to the data instead of starting at zero: from zero, a
 * true-shooting career of 42–56% used a fifth of the plot. It's a dot chart (the reader compares
 * positions, not bar lengths), so a non-zero floor is honest, and the bottom tick says where it is.
 * Counting stats keep zero, a real floor players sit near (blocks 0.2–0.5).
 *
 * Rules, in tenths of a percentage point (integers, so no float drift):
 *  - covers every value passed (the player's seasons and the reference dots) with at least a point of
 *    clearance;
 *  - ends snap to whole fives and the span to a whole ten, so the three ticks read "40% 50% 60%";
 *  - never narrower than 20 points, or a 55→56% career would stretch across the whole plot;
 *  - the top value sits no higher than LABEL_HEADROOM of the span, so its label stays under the frame;
 *  - grows toward the side with less room (ties go up), never below 0%.
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

/** The highest share of the plot a value dot may sit at and still fit its label above it: the label sits
    12px above the dot's centre and is ~11px tall, on a 220px plot, so 23/220 ≈ 10.5% must stay free (both
    numbers live in StatDrilldownView). Used by the fitted % axis and to clamp a small-sample dot; a
    counting stat's 1.2× headroom (top at 83%) already satisfies it. */
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

  // The chart shows only trustworthy seasons: played, with a value, and not a small sample. The table
  // keeps the full record.
  const chartable = allPlayed.filter((s) => s[key] != null && !small(s));

  // On the same basis as the heatmap's self mode, so the plate and the self-mode cells agree.
  const careerAvg = ownStatAverage(key, careerBasis(allPlayed));

  const posOk = playerPosition != null && positions != null;
  const refFor = (year: number): number | null =>
    mode === "self"
      ? careerAvg
      : mode === "position"
        ? posOk
          ? positions.avg(year, playerPosition, key)
          : null
        : league.avg(year, key);
  // The rank and pool of the mode's crowd: the position in position mode, otherwise the league (self mode
  // has no crowd, so it shows the league rank). A shooting % ranks in its own, smaller pool.
  const rankOf = (s: SeasonPlayed): number | null => (mode === "position" ? s.posRank?.[key] : s.rank?.[key]) ?? null;
  const poolOf = (s: SeasonPlayed): number | null =>
    (isRateStat(key)
      ? mode === "position"
        ? s.posRatePool?.[key]
        : s.ratePool?.[key]
      : mode === "position"
        ? s.posPool
        : s.pool) ?? null;

  // The scale covers everything the plot draws, values and references, so nothing clips. A counting stat
  // runs from zero to 1.2× the top; a shooting % gets a fitted axis (pctAxis).
  const drawn = chartable.flatMap((s) => [s[key] as number, refFor(s.year)]).filter((v): v is number => v != null);
  const axis = stat.pct ? pctAxis(drawn) : { lo: 0, hi: Math.max(...drawn, 0) * 1.2 || 1 };
  const pctOf = (v: number) => +(((v - axis.lo) / (axis.hi - axis.lo)) * 100).toFixed(2);
  const clamp = (h: number) => Math.min(LABEL_HEADROOM * 100, Math.max(5, h));

  const bars: StatBar[] = player.seasons.map((s) => {
    const yy = String(s.year).slice(2);
    if (!s.played)
      return {
        year: s.year,
        yy,
        kind: "missed",
        valFmt: "—",
        labelFmt: "",
        baseFmt: null,
        hPct: null,
        basePct: null,
        up: null,
      };
    const v = s[key];
    if (v == null || small(s)) {
      return {
        year: s.year,
        yy,
        kind: "small",
        valFmt: fmtV(v, stat.pct),
        labelFmt: v == null ? "" : fmtCell(v, stat.pct),
        baseFmt: null,
        hPct: v == null ? null : clamp(pctOf(v)),
        basePct: null,
        up: null,
      };
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

  // Fewer than two trustworthy seasons: no trend to draw. One line for every cause; the hollow cells'
  // notes say which.
  const chartFallback = chartable.length < 2 ? "Not enough data to chart a trend." : null;

  const tableRows: StatTableRow[] = player.seasons.map((x) => {
    if (!x.played) {
      return {
        year: x.year,
        min: null,
        valFmt: "—",
        gp: null,
        deltaFmt: "—",
        deltaColor: "var(--color-neutral-700)",
        rank: null,
        pool: null,
        unranked: null,
        missed: true,
        smallSample: false,
        note: null,
        partial: false,
        reason: x.reason,
      };
    }
    const v = x[key];
    const b = refFor(x.year);
    const sm = small(x);
    // No gap on a small-sample row: a "+64%" off a 1-of-1 season is the noise hidden everywhere else.
    const hasDelta = !sm && v != null && b != null;
    return {
      year: x.year,
      min: x.min,
      valFmt: fmtV(v, stat.pct),
      gp: x.gp,
      deltaFmt: hasDelta ? fmtRaw(v - b, stat.pct) : "—",
      // Grey when there's no direction to show: a "—" or a "0.0".
      deltaColor:
        !hasDelta || roundsToZero(v - b, stat.pct)
          ? "var(--color-text-muted)"
          : v - b > 0
            ? "var(--hm-above-text)"
            : "var(--hm-below-text)",
      rank: sm ? null : rankOf(x),
      pool: poolOf(x),
      unranked: sm ? null : rankNote(x, key, mode, playerPosition),
      missed: false,
      smallSample: sm,
      note: sm ? smallSampleReason(x, key) : null,
      partial: isPartialSeason(x),
    };
  });

  // Plate numbers: one decimal for a counting stat, a whole percent for a shooting % (the % sign is the
  // word after it). The chart and table keep one decimal.
  const plateFmt = (v: number | null): string =>
    v == null ? "—" : stat.pct ? String(Math.round(v * 100)) : v.toFixed(1);
  let summary: CareerSummary | null = null;
  if (chartable.length > 0) {
    const val = (s: SeasonPlayed) => s[key] as number;
    const high = chartable.reduce((a, s) => (val(s) > val(a) ? s : a));
    const low = chartable.reduce((a, s) => (val(s) < val(a) ? s : a));
    const ranked = chartable.filter((s) => rankOf(s) != null && poolOf(s) != null);
    // Best = the smallest share of the pool (rank ÷ pool), compared by cross-multiplying so equal shares
    // are exactly equal. Ties go to the larger pool, then the later year.
    const best = ranked.reduce<SeasonPlayed | null>((a, s) => {
      if (a == null) return s;
      const r = rankOf(s) as number,
        ra = rankOf(a) as number;
      const p = poolOf(s) as number,
        pa = poolOf(a) as number;
      const lhs = r * pa,
        rhs = ra * p;
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
    // The table lists the newest season first; the chart stays left-to-right chronological.
    tableRows: [...tableRows].reverse(),
    // A fitted % axis lands on whole fives, so its labels drop the tenth ("40%", not "40.0%").
    axisTicks: [0, 50, 100].map((yPct) => {
      const v = axis.lo + ((axis.hi - axis.lo) * yPct) / 100;
      return { yPct, label: stat.pct ? `${Math.round(v * 100)}%` : fmtV(v, false) };
    }),
  };
}
