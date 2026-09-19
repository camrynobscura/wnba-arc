import { STATS, type StatDef } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, SeasonPlayed } from "../data/api";

// Every comparison on the page — heatmap cells and the drill-down beneath — measures a season
// against ONE switchable reference (HeatmapMode: their career, the league, or their position that
// year). The drill-down used to have its own target type and a picked "subject" season; both went
// when it moved under the heatmap (the cell popover carries per-season detail). See DECISIONS.

/** A season below this fraction of its year's scheduled games is "small sample" (D6).
    25% ≈ 11 of a 44-game season — a ~10–13 game year counts, a handful of games doesn't.
    Must stay equal to wnba-data's SMALL_SAMPLE_FRACTION (scripts/compute-league.ts), which
    uses the same bar to pick which players qualify for the league averages. Keep them paired. */
const SMALL_SAMPLE_FRACTION = 0.25;
/** A full-length deviation bar = the stat is this fraction above/below baseline (S1). Used for
    the shooting-% bars (relative change) and as the fallback for a counting stat when its
    comparison group has no spread on the wire (data older than migration 004). */
const BAR_FULL_SCALE = 0.5;
/** A full-length COUNTING-stat bar = this many "steps" (population standard deviations of the
    comparison group) above/below the baseline. 3 already means "almost nobody's out here", so
    the rare 4-step+ signature seasons clip to a full bar. See AboutView / DECISIONS. */
const FULL_STEPS = 3;
/** Fallback slate length for a year the league data doesn't list (shouldn't happen). */
const DEFAULT_SCHEDULED_GAMES = 40;

/** Minimum attempts for a shooting-percentage stat to count as a meaningful sample. A % on a
    handful of shots is noise — A'ja Wilson went 1-for-1 (100%) from three in 2021, which both
    inflated her career-3P baseline and dominated the Career Trend color scale. Measured against
    our data: extreme 0%/100% seasons are almost entirely a 1–9-attempt phenomenon, and a
    threshold of 10 catches 75 of 77 such 3P seasons while suppressing only ~12% of shooting
    seasons (and just 1 FG% season — everyone who plays takes 50+ field goals). This gate is
    ORTHOGONAL to the games-played gate: a full-games season can still be attempt-thin. */
const MIN_RATE_ATTEMPTS = 10;

/** Shooting-percentage stats that are a make/attempt ratio, mapped to where the raw pair lives
    on a season. These get (1) the attempt-count small-sample gate above and (2) a baseline
    POOLED from summed makes/attempts rather than a mean of season percentages — so one
    low-attempt season can neither swing the baseline nor show a misleading solo value. TS% is
    intentionally excluded: its denominator mixes shot types (needs free-throw attempts, not on
    the wire) and it's barely affected in practice. */
const RATE_STAT_ATTEMPTS: Partial<
  Record<
    StatKey,
    // `noun` is the plural for tooltips ("three-pointers made"); `adj` is the attributive form
    // for "…enough three-point attempts" (plural + "attempts" would be ungrammatical).
    { made: keyof SeasonPlayed; att: keyof SeasonPlayed; madeShort: string; attShort: string; noun: string; adj: string }
  >
> = {
  fgp: { made: "fgMade", att: "fgAtt", madeShort: "FGM", attShort: "FGA", noun: "field goals", adj: "field-goal" },
  tpp: { made: "fg3Made", att: "fg3Att", madeShort: "3PM", attShort: "3PA", noun: "three-pointers", adj: "three-point" },
};

export type StatKey = StatDef["key"];

/** The five counting stats whose bars measure in "steps" and carry a spread + percentile. The
    shooting %s (fgp/tpp/tsPct) are absent — they keep the relative-% bar and have neither. */
const COUNTING_KEYS = ["pts", "reb", "ast", "stl", "blk"] as const;
type CountingKey = (typeof COUNTING_KEYS)[number];
export function isCountingStat(key: StatKey): key is CountingKey {
  return (COUNTING_KEYS as readonly string[]).includes(key);
}

/** Percentile (0–100) of `value` within a decile ladder — 11 values at the 0,10,…,100th
    percentiles (the backend's spacing; see wnba-data src/db/spread.ts). Linear interpolation
    between rungs, clamped to [0,100]. */
function interpPercentile(ladder: number[], value: number): number {
  const n = ladder.length;
  if (n === 0) return 0;
  if (value <= ladder[0]) return 0;
  if (value >= ladder[n - 1]) return 100;
  const stepPct = 100 / (n - 1); // each gap spans one decile = 10 percentile points
  for (let i = 1; i < n; i++) {
    if (value <= ladder[i]) {
      const lo = ladder[i - 1];
      const hi = ladder[i];
      const frac = hi > lo ? (value - lo) / (hi - lo) : 0;
      return (i - 1) * stepPct + frac * stepPct;
    }
  }
  return 100;
}

/**
 * Per-year league lookups, built once from the API's /league data. This replaces
 * the old hardcoded mock `leagueAvg`/`scheduledGames` — real per-year averages and
 * real slate lengths now flow in from the data layer.
 */
export interface League {
  /** League average of a stat for a year; null if that year isn't in the data. */
  avg(year: number, key: StatKey): number | null;
  /** The year's scheduled-game count — the small-sample denominator. */
  scheduled(year: number): number;
  /** Population spread ("step") of a counting stat that year — the ruler for the deviation
      bars. Null for shooting %s (no step) or when the API predates the spread data (migration
      004), in which case the bar falls back to relative-%. */
  stdev(year: number, key: StatKey): number | null;
  /** Where `value` lands (0–100) among that year's qualified players for a counting stat;
      null for shooting %s or missing data. */
  pctile(year: number, key: StatKey, value: number): number | null;
  /** The value-at-decile ladder itself (11 rungs, 0th…100th) for a counting stat that year —
      the drill-down draws the 10th–90th band from it. Null for shooting %s or missing data. */
  ladder(year: number, key: StatKey): number[] | null;
}

export function makeLeague(seasons: LeagueSeason[]): League {
  const byYear = new Map(seasons.map((s) => [s.year, s]));
  return {
    avg: (year, key) => byYear.get(year)?.[key] ?? null,
    scheduled: (year) => byYear.get(year)?.scheduledGames ?? DEFAULT_SCHEDULED_GAMES,
    stdev: (year, key) => (isCountingStat(key) ? (byYear.get(year)?.stdev?.[key] ?? null) : null),
    pctile: (year, key, value) => {
      if (!isCountingStat(key)) return null;
      const ladder = byYear.get(year)?.pctiles?.[key];
      return ladder ? interpPercentile(ladder, value) : null;
    },
    ladder: (year, key) => (isCountingStat(key) ? (byYear.get(year)?.pctiles?.[key] ?? null) : null),
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
  /** Where `value` lands (0–100) among that (year, position) bucket for a counting stat. */
  pctile(year: number, position: string, key: StatKey, value: number): number | null;
  /** The bucket's decile ladder for a counting stat (see League.ladder). */
  ladder(year: number, position: string, key: StatKey): number[] | null;
}

export function makePositionLookup(seasons: PositionSeason[]): PositionLookup {
  const byKey = new Map(seasons.map((s) => [`${s.year}|${s.position}`, s]));
  return {
    avg: (year, position, key) => byKey.get(`${year}|${position}`)?.[key] ?? null,
    stdev: (year, position, key) =>
      isCountingStat(key) ? (byKey.get(`${year}|${position}`)?.stdev?.[key] ?? null) : null,
    pctile: (year, position, key, value) => {
      if (!isCountingStat(key)) return null;
      const ladder = byKey.get(`${year}|${position}`)?.pctiles?.[key];
      return ladder ? interpPercentile(ladder, value) : null;
    },
    ladder: (year, position, key) => (isCountingStat(key) ? (byKey.get(`${year}|${position}`)?.pctiles?.[key] ?? null) : null),
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

/** First token of a full name — used to personalize the on-page descriptions ("Paige's
    career average" rather than "the player's"). Falls back to the whole string. */
export function firstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

function sgn(r: number): string {
  if (r > 0.0001) return "+";
  if (r < -0.0001) return "−";
  return "±";
}

/** Raw delta in the stat's own units — percentage *points* for rate stats. */
export function fmtRaw(r: number, pct: boolean): string {
  return sgn(r) + (pct ? (Math.abs(r) * 100).toFixed(1) + " pp" : Math.abs(r).toFixed(1));
}

export function playedSeasons(player: PlayerDetail): SeasonPlayed[] {
  return player.seasons.filter((x): x is SeasonPlayed => x.played);
}

/** True when a season's games played fall below the small-sample threshold for its year. */
export function isSmallSample(season: SeasonPlayed, league: League): boolean {
  return season.gp < SMALL_SAMPLE_FRACTION * league.scheduled(season.year);
}

/** Attempts a season took for a shooting-% stat, or null if the stat isn't a make/attempt
    rate (a counting stat, or TS%) — used by the attempt gate and the pooled average. */
function rateAttempts(season: SeasonPlayed, statKey: StatKey): number | null {
  const pair = RATE_STAT_ATTEMPTS[statKey];
  if (!pair) return null;
  const att = season[pair.att];
  return typeof att === "number" ? att : null;
}

/** Whether a season is too thin a sample to trust FOR A GIVEN STAT — either too few games
    (any stat) or, for a shooting %, too few attempts of that shot. This is the per-stat gate
    the heatmap cells, drill-down bars, and summary bars all read; it supersedes the plain
    games-only isSmallSample everywhere a single (season, stat) value is shown or selected. */
export function isStatSmallSample(season: SeasonPlayed, league: League, statKey: StatKey): boolean {
  if (isSmallSample(season, league)) return true;
  const att = rateAttempts(season, statKey);
  return att != null && att < MIN_RATE_ATTEMPTS;
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
  /** Exact, one decimal ("51.9%", "26.9") — the popover and the cell's accessible name. */
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
  /** Too thin a sample for this stat that season → greyed, not heat-colored, not clickable. */
  smallSample: boolean;
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
      const comparable = played.filter((s) => !isStatSmallSample(s, league, st.key));
      const basis = comparable.length >= 2 ? comparable : played;
      const avg = ownStatAverage(st.key, basis);
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
        return { ...shell, played: false, value: null, valueFmt: "—", cellFmt: "—", refValue: null, refFmt: "—", delta: null, deltaFmt: "—", colorT: null, up: false, smallSample: false, selectable: false };
      }
      const value = s[st.key];
      const small = isStatSmallSample(s, league, st.key);
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
        smallSample: small,
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

/**
 * The percentile (0–100) a heatmap cell's season ranks at within its comparison group — the
 * rank the reveal strip shows next to the value + gap. Null whenever there's no rank to give:
 * **self mode** (a rank is among *other* players; "vs their own career" has no population),
 * a **shooting %** (no ladder), a missed / small-sample / valueless cell, or a position mode
 * whose bucket is absent that year. Reads the same per-year ladders as the drill-down's
 * "Pct" column, so the two always agree.
 */
export function cellPercentile(
  cell: HeatmapCell,
  mode: HeatmapMode,
  league: League,
  positions: PositionLookup | null,
  playerPosition: string | null,
): number | null {
  if (mode === "self" || !cell.played || cell.smallSample || cell.value == null) return null;
  if (!isCountingStat(cell.statKey)) return null;
  if (mode === "position") {
    return playerPosition != null && positions != null
      ? positions.pctile(cell.year, playerPosition, cell.statKey, cell.value)
      : null;
  }
  return league.pctile(cell.year, cell.statKey, cell.value);
}

// ── Stat drill-down ───────────────────────────────────────────────────────────
// One stat's year-by-year history beneath the heatmap: a per-season dumbbell (the season's
// value vs. its reference), the comparison group's spread behind it, a career summary, and
// the yearly table. The reference follows the SAME switch as the heatmap — their career, the
// league, or their position — so the two views on one page never quietly disagree. (An
// earlier version compared everything to one "subject" season the reader picked; the heatmap's
// cell popover now carries per-season detail, so the subject and its picker went. DECISIONS.)

/** One charted season. Percent values are heights on the chart's 0–100 scale (0 = bottom). */
export interface StatBar {
  year: number;
  yy: string;
  valFmt: string;
  /** That season's reference, formatted; null when there is none (a position-year with no bucket). */
  baseFmt: string | null;
  hPct: number;
  basePct: number | null;
  /** Above (true) or below (false) the reference; null with no reference → a neutral dot. */
  up: boolean | null;
  /** The comparison group's spread that year — 10th, median, and 90th percentile heights. Peer
      modes and counting stats only (the ladders exist for nothing else); null otherwise. */
  band: { loPct: number; midPct: number; hiPct: number } | null;
}

export interface StatTableRow {
  year: number;
  min: number | null; // per-game minutes; null ~10% of seasons
  valFmt: string;
  gp: number | null;
  /** Makes/attempts behind a rate stat (e.g. 3PM/3PA), so the table shows WHY a season is a
      small sample. Null for counting stats and missed seasons — those columns aren't shown. */
  made: number | null;
  att: number | null;
  deltaFmt: string;
  deltaColor: string;
  /** Percentile within the comparison group (peer modes, counting stats); null otherwise. */
  pctile: number | null;
  /** League rank that season (1 = best) and the qualified pool it's among — from the API. Counting
      stats only, and only for a season that qualified. Always a LEAGUE rank, whatever the mode. */
  rank: number | null;
  pool: number | null;
  missed: boolean;
  smallSample: boolean;
  reason?: string;
}

/** The career at a glance for one stat, over the full seasons the chart draws. */
export interface CareerSummary {
  seasons: number;
  high: { fmt: string; year: number };
  low: { fmt: string; year: number };
  /** Career average of this stat (pooled makes/attempts for a shooting %), formatted; "—" if none. */
  careerAvg: string;
  /** Full seasons above the reference, out of those that had one; null when none had one. */
  above: { n: number; of: number } | null;
  /** Best league rank across full seasons ("1st of 158"); ties go to the larger pool, then the
      later year. Null for shooting %s (no rank) or when no season qualified. */
  bestRank: { rank: number; pool: number; year: number } | null;
}

export interface StatDetail {
  label: string;
  short: string;
  /** True for shooting-percentage stats (no "per game" unit); false for counting stats. */
  pct: boolean;
  /** The word after a summary number: the stat's name for a counting stat ("14.3 points", "1.9 steals");
      "%" for a shooting %, whose plate numbers are whole percents ("35" + "%"). */
  unit: string;
  /** For a rate stat, the makes/attempts column labels the table should add (e.g. 3PM/3PA);
      null for a counting stat, where those columns don't apply. */
  component: { madeShort: string; attShort: string; noun: string } | null;
  /** "Each season below is measured against …" — names the reference, scoped to the chart + table. */
  caption: string;
  /** Position mode: charted seasons with no same-position bucket (no reference → neutral dot). */
  positionNote?: string;
  summary: CareerSummary | null;
  /** When the chart can't show a meaningful trend (fewer than 2 trustworthy seasons), this is
      the line the view renders in place of the plot. Null when the chart renders normally. */
  chartFallback: string | null;
  bars: StatBar[];
  tableRows: StatTableRow[];
  /** Y-axis gridline levels: yPct (0 = bottom, 100 = top of scale) + formatted label. */
  axisTicks: { yPct: number; label: string }[];
  /** Whether any bar carries a band — drives the legend entry. */
  hasBand: boolean;
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

/** Self mode needs ≥2 seasons to be meaningful (one season vs. itself is all-neutral); a
    one-season player is offered only the peer modes, and a stray self mode degrades to league. */
export function selfModeAvailable(player: PlayerDetail): boolean {
  return playedSeasons(player).length >= 2;
}

/** The "Compare to" options — the heatmap's control and the drill-down's synced copy render the
    same list, so the page never offers a mode in one place it can't honor in the other. */
export function compareOptions(canSelf: boolean, positionAvailable: boolean, position: string | null): { value: HeatmapMode; label: string }[] {
  return [
    ...(canSelf ? [{ value: "self" as const, label: "their career" }] : []),
    { value: "league" as const, label: "the league" },
    ...(positionAvailable ? [{ value: "position" as const, label: `other ${positionNoun(position)}` }] : []),
  ];
}

/** The summary plate that counts seasons above the reference, labeled by mode. Twelve characters
    at most on purpose: the plate is narrow and the label must not wrap. "Peers" stands in for
    "other guards/forwards/centers", which doesn't fit. */
export function aboveLabel(mode: HeatmapMode): string {
  return mode === "league" ? "Above league" : mode === "position" ? "Above peers" : "Above career";
}

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
  const small = (s: SeasonPlayed) => isStatSmallSample(s, league, key);
  const componentPair = RATE_STAT_ATTEMPTS[key];
  const ck: CountingKey | null = isCountingStat(key) ? key : null;

  // The chart shows only trustworthy seasons: played, with a value for this stat, and NOT a small
  // sample (too few games, or too few attempts for a shooting %). Noise never reaches the plot;
  // the table below keeps the full record.
  const chartable = allPlayed.filter((s) => s[key] != null && !small(s));

  // Career average on the SAME basis the heatmap's self mode uses (full seasons; every played
  // season if fewer than two are full), so the plate and the self-mode cells agree.
  const comparable = allPlayed.filter((s) => !small(s));
  const careerAvg = ownStatAverage(key, comparable.length >= 2 ? comparable : allPlayed);

  const posOk = playerPosition != null && positions != null;
  const refFor = (year: number): number | null =>
    mode === "self" ? careerAvg : mode === "position" ? (posOk ? positions.avg(year, playerPosition, key) : null) : league.avg(year, key);
  const ladderFor = (year: number): number[] | null =>
    mode === "self" ? null : mode === "position" ? (posOk ? positions.ladder(year, playerPosition, key) : null) : league.ladder(year, key);
  const pctileFor = (year: number, v: number): number | null =>
    mode === "self" ? null : mode === "position" ? (posOk ? positions.pctile(year, playerPosition, key, v) : null) : league.pctile(year, key, v);
  const bandFor = (year: number) => {
    const l = ladderFor(year);
    return l && l.length >= 11 ? { lo: l[1], mid: l[5], hi: l[9] } : null;
  };
  const rankOf = (s: SeasonPlayed): number | null => (ck != null && s.rank ? s.rank[ck] : null);

  // Scale spans the charted values, their references, and the band tops, so nothing clips and the
  // axis never rescales between modes for the same reason twice. 1.2 leaves headroom.
  const tops = chartable
    .flatMap((s) => [s[key] as number, refFor(s.year), bandFor(s.year)?.hi ?? null])
    .filter((v): v is number => v != null);
  const maxVal = Math.max(...tops, 0) * 1.2 || 1;
  const pctOf = (v: number) => +((v / maxVal) * 100).toFixed(2);

  const bars: StatBar[] = chartable.map((s) => {
    const v = s[key] as number; // non-null by the chartable filter
    const b = refFor(s.year);
    const band = bandFor(s.year);
    return {
      year: s.year,
      yy: String(s.year).slice(2),
      valFmt: fmtV(v, stat.pct),
      baseFmt: b != null ? fmtV(b, stat.pct) : null,
      hPct: pctOf(v),
      basePct: b != null ? pctOf(b) : null,
      up: b != null ? v >= b : null,
      band: band ? { loPct: pctOf(band.lo), midPct: pctOf(band.mid), hiPct: pctOf(band.hi) } : null,
    };
  });

  // Fewer than 2 trustworthy seasons → no meaningful trend to draw (e.g. a player who almost
  // never shoots threes). The view shows this line instead of the plot; the table still lists
  // every season with its makes/attempts, so the record stays complete.
  const chartFallback =
    chartable.length < 2
      ? componentPair
        ? `Too few seasons with enough ${componentPair.adj} attempts to chart a trend.`
        : "Not enough seasons to chart a trend."
      : null;

  const tableRows: StatTableRow[] = player.seasons.map((x) => {
    if (!x.played) {
      return { year: x.year, min: null, valFmt: "—", gp: null, made: null, att: null, deltaFmt: "—", deltaColor: "var(--color-neutral-700)", pctile: null, rank: null, pool: null, missed: true, smallSample: false, reason: x.reason };
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
      made: componentPair ? (x[componentPair.made] as number) : null,
      att: componentPair ? (x[componentPair.att] as number) : null,
      deltaFmt: hasDelta ? fmtRaw(v - b, stat.pct) : "—",
      deltaColor: hasDelta && v - b >= 0 ? "var(--hm-above-text)" : "var(--hm-below-text)",
      pctile: !sm && v != null ? pctileFor(x.year, v) : null,
      rank: sm ? null : rankOf(x),
      pool: x.pool ?? null,
      missed: false,
      smallSample: sm,
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
    const withRef = chartable.filter((s) => refFor(s.year) != null);
    const ranked = chartable.filter((s) => rankOf(s) != null && s.pool != null);
    // Best = the lowest rank; a tie goes to the larger pool (the stronger, more complete fact),
    // then the later year.
    const best = ranked.reduce<SeasonPlayed | null>((a, s) => {
      if (a == null) return s;
      const r = rankOf(s) as number, ra = rankOf(a) as number;
      return r < ra || (r === ra && ((s.pool as number) > (a.pool as number) || (s.pool === a.pool && s.year > a.year))) ? s : a;
    }, null);
    summary = {
      seasons: chartable.length,
      high: { fmt: plateFmt(val(high)), year: high.year },
      low: { fmt: plateFmt(val(low)), year: low.year },
      careerAvg: plateFmt(careerAvg),
      above: withRef.length ? { n: withRef.filter((s) => val(s) > (refFor(s.year) as number)).length, of: withRef.length } : null,
      bestRank: best ? { rank: rankOf(best) as number, pool: best.pool as number, year: best.year } : null,
    };
  }

  const first = firstName(player.name);
  const caption =
    mode === "self"
      ? `Each season below is measured against ${first}'s career average.`
      : mode === "league"
        ? "Each season below is measured against the league average for that year."
        : `Each season below is measured against the average for ${positionNoun(playerPosition)} that year.`;
  const noBucket = mode === "position" ? chartable.filter((s) => refFor(s.year) == null).map((s) => s.year) : [];

  return {
    label: stat.label,
    short: stat.short,
    pct: stat.pct,
    unit: stat.pct ? "%" : stat.label.toLowerCase(),
    component: componentPair ? { madeShort: componentPair.madeShort, attShort: componentPair.attShort, noun: componentPair.noun } : null,
    caption,
    positionNote: noBucket.length
      ? `No same-position average for ${noBucket.join(", ")} — too few ${positionNoun(playerPosition)} on record those seasons.`
      : undefined,
    summary,
    chartFallback,
    bars,
    // Table lists newest season first; the chart stays left-to-right chronological.
    tableRows: [...tableRows].reverse(),
    axisTicks: [0, 50, 100].map((yPct) => ({ yPct, label: fmtV((maxVal * yPct) / 100, stat.pct) })),
    hasBand: bars.some((b) => b.band != null),
  };
}
