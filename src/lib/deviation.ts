import { STATS, type StatDef } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, SeasonMissed, SeasonPlayed } from "../data/api";

// The subject season is compared to that SAME year's peer group — the whole league, or the
// player's position. (An earlier "own history" target + a Window control were removed: the
// Career Trend heatmap already tells the own-trajectory story, and comparing one season to a
// multi-year peer blob was confusing. See DECISIONS.)
export type ComparisonTarget = "league" | "position";

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

export interface BaselineContext {
  /** The league lookup this context was built with — downstream fns read it for averages. */
  league: League;
  /** The per-(year, position) lookup — the source for the position baseline. Null until
      /positions loads (or if it failed), in which case position mode isn't offered. */
  positions: PositionLookup | null;
  /** The player's position code (G/F/C), or null if unknown — whose peers the position
      baseline compares against. */
  playerPosition: string | null;
  /** Whether the position baseline can be offered at all (the player has a known position
      and /positions loaded). */
  positionAvailable: boolean;
  /** True in position mode when the subject season has no same-position sample (that year's
      bucket is absent) — the UI shows a "no sample" note and the baseline is null. */
  positionSampleMissing: boolean;
  /** The season under examination (the "subject"), defaulting to the latest *selectable*
      (full, non-small-sample) season. */
  subject: SeasonPlayed;
  /** Years offered in the season picker, newest first — full seasons only (small-sample
      seasons are excluded). Falls back to every played year if the player has no full season. */
  selectableYears: number[];
  /** Small-sample seasons excluded from selection, shown as a "not selectable" note.
      Empty in the fallback case (player has only small-sample seasons, so they stay selectable). */
  nonSelectableSmallSample: SeasonPlayed[];
  /** What the subject season is compared against — the whole league or the player's position. */
  target: ComparisonTarget;
  /** Gaps in the player's timeline (no data for that year). */
  missedSeasons: SeasonMissed[];
}

export function getBaselineContext(
  player: PlayerDetail,
  league: League,
  positions: PositionLookup | null,
  subjectYear: number | null,
  target: ComparisonTarget,
): BaselineContext {
  const played = playedSeasons(player);
  // Only full (non-small-sample) seasons are selectable as the subject — a handful of
  // games makes a misleading analysis. Fall back to every played season if the player has
  // no full season at all, so their page still renders.
  const fullSeasons = played.filter((s) => !isSmallSample(s, league));
  const selectable = fullSeasons.length > 0 ? fullSeasons : played;
  const subject = selectable.find((s) => s.year === subjectYear) ?? selectable[selectable.length - 1];

  const playerPosition = player.pos;
  const positionAvailable = playerPosition != null && positions != null;

  // In position mode, does the subject's own year have a same-position sample? (Uses "pts" as a
  // witness — if the (year, position) row exists, all its stats do.) If not, the baseline is
  // null and the UI shows a note; position never silently falls back to league.
  const positionSampleMissing =
    target === "position" &&
    (playerPosition == null || positions == null || positions.avg(subject.year, playerPosition, "pts") == null);

  return {
    league,
    positions,
    playerPosition,
    positionAvailable,
    positionSampleMissing,
    subject,
    selectableYears: [...selectable].map((s) => s.year).reverse(),
    nonSelectableSmallSample: fullSeasons.length > 0 ? played.filter((s) => isSmallSample(s, league)) : [],
    target,
    missedSeasons: player.seasons.filter((s): s is SeasonMissed => !s.played),
  };
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

export function getBaselineValue(statKey: StatDef["key"], ctx: BaselineContext): number | null {
  const y = ctx.subject.year;
  if (ctx.target === "position") {
    const pos = ctx.playerPosition;
    const lookup = ctx.positions;
    if (pos == null || lookup == null) return null;
    return lookup.avg(y, pos, statKey);
  }
  return ctx.league.avg(y, statKey);
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

export function buildCaption(ctx: BaselineContext, playerName: string): string {
  const { subject, target, playerPosition } = ctx;
  if (target === "position")
    return `Comparing ${firstName(playerName)}'s ${subject.year} against other ${positionNoun(playerPosition)} that season.`;
  return `Comparing ${firstName(playerName)}'s ${subject.year} against the WNBA league average that season.`;
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
  valueFmt: string;
  /** value − the mode's reference average; null when there's no reference or no value. */
  delta: number | null;
  deltaFmt: string;
  /** −1…1 signed, normalized deviation for the cell color; null → neutral (no reference,
      or a greyed small-sample cell). */
  colorT: number | null;
  up: boolean;
  /** Too thin a sample for this stat that season → greyed, not heat-colored, not clickable. */
  smallSample: boolean;
  /** Whether the cell opens the drill-down: a played, full-sample season with a value. */
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
        return { ...shell, played: false, value: null, valueFmt: "—", delta: null, deltaFmt: "—", colorT: null, up: false, smallSample: false, selectable: false };
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

export interface StatBar {
  year: number;
  yy: string;
  missed: boolean;
  played: boolean;
  isSubject: boolean;
  reason?: string;
  valFmt?: string;
  /** That season's baseline, formatted — labeled on the chart for the selected season and in
      every column's hover title, so the actual baseline number is readable. */
  baseFmt?: string;
  /** Value's height as a percent of the chart height (the line point). */
  hPct?: number;
  /** This season's baseline height (percent) — the per-year tick (that year's league or
      position average). Undefined = no baseline (a year with no same-position sample). */
  basePct?: number;
  smallSample?: boolean;
  /** Whether this season can be selected as the subject — false for small-sample seasons
      (unless the player has no full season, the fallback, where they stay selectable). */
  selectable?: boolean;
  color?: string;
  /** Played season with no value for THIS stat (e.g. 0 three-point attempts) — render an empty slot. */
  noValue?: boolean;
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
  /** This season's percentile (0–100) within its comparison group (league/position) — the
      table's "Pct" column. Null for shooting %s (no ladder), small-sample/missed seasons, a
      missing position bucket, or pre-004 data. */
  pctile: number | null;
  missed: boolean;
  smallSample: boolean;
  /** Whether this season can be selected as the subject (see StatBar.selectable). */
  selectable: boolean;
  isSubject: boolean;
  reason?: string;
}

export interface StatDetail {
  year: number;
  label: string;
  short: string;
  /** True for shooting-percentage stats (no "per game" unit); false for counting stats. */
  pct: boolean;
  curFmt: string;
  baseFmt: string;
  rawFmt: string;
  up: boolean;
  deltaColor: string;
  caption: string;
  /** Set in position mode when the subject season has no same-position sample — the view
      shows it as a note (values still render "—" / no baseline tick). */
  positionNote?: string;
  /** For a rate stat, the makes/attempts column labels the table should add (e.g. 3PM/3PA);
      null for a counting stat, where those columns don't apply. */
  component: { madeShort: string; attShort: string; noun: string } | null;
  /** True when the subject season is itself too thin a sample for this stat — the header shows
      the value but no (meaningless) delta, mirroring the summary bar. */
  subjectSmallSample: boolean;
  /** When the chart can't show a meaningful trend (fewer than 2 trustworthy seasons), this is
      the line the view renders in place of the plot. Null when the chart renders normally. */
  chartFallback: string | null;
  bars: StatBar[];
  tableRows: StatTableRow[];
  /** Y-axis gridline levels: yPct (0 = bottom, 100 = top of scale) + formatted label. */
  axisTicks: { yPct: number; label: string }[];
}

export function buildStatDetail(player: PlayerDetail, stat: StatDef, ctx: BaselineContext): StatDetail {
  const { subject } = ctx;
  const cur = subject[stat.key];

  const allPlayed = playedSeasons(player);
  // A season is selectable as the subject unless it's a small sample FOR THIS STAT (few games,
  // or for a shooting % too few attempts) — so selecting it never puts a noisy 100%-on-1-shot
  // season under the lens. If no season qualifies for this stat, they all stay selectable.
  const anyFull = allPlayed.some((s) => !isStatSmallSample(s, ctx.league, stat.key));
  const target = ctx.target;

  // Each season's baseline = that year's league (or position) average, drawn as a per-year tick,
  // so the chart is static — selecting a season never moves a shared baseline. A position year
  // with no same-position sample has no baseline (null → no tick, and a neutral value dot).
  const baselineByYear = new Map<number, number | null>();
  for (const s of allPlayed) {
    let b: number | null;
    if (target === "position") {
      const pos = ctx.playerPosition;
      const lookup = ctx.positions;
      b = pos == null || lookup == null ? null : lookup.avg(s.year, pos, stat.key);
    } else {
      b = ctx.league.avg(s.year, stat.key);
    }
    baselineByYear.set(s.year, b);
  }

  // Header + table compare against the SAME per-year baseline the chart draws for the
  // subject (keeps all three consistent), instead of a separately-computed value.
  const base = baselineByYear.get(subject.year) ?? null;
  // If the subject is itself too thin a sample for this stat, its value is noise → show it in
  // the header but suppress the (meaningless) delta, mirroring the summary bar.
  const subjectSmall = isStatSmallSample(subject, ctx.league, stat.key);
  const hasDelta = !subjectSmall && cur != null && base != null;
  const up = hasDelta ? cur - base >= 0 : false;

  // A season's percentile within its comparison group — the position bucket in position mode,
  // else the league. Null for shooting %s (no ladder), a small-sample season, a missing position
  // bucket, or pre-004 data. Fed to the table's "Pct" column.
  const pctileFor = (year: number, value: number): number | null =>
    ctx.target === "position" && ctx.playerPosition != null && ctx.positions != null
      ? ctx.positions.pctile(year, ctx.playerPosition, stat.key, value)
      : ctx.league.pctile(year, stat.key, value);

  // The chart shows only trustworthy seasons: played, with a value for this stat, and NOT a
  // small sample (too few games, or too few attempts for a shooting %). DNP / 0-attempt /
  // attempt-thin seasons are dropped entirely — not shown as gaps or a misleading dot — so a
  // noisy 1-of-1 = 100% can't sit at the top looking valid or stretch the scale. Columns
  // re-space to whatever remains; the table below keeps the full record.
  const componentPair = RATE_STAT_ATTEMPTS[stat.key];
  const chartable = allPlayed.filter((x) => x[stat.key] != null && !isStatSmallSample(x, ctx.league, stat.key));

  // Scale spans the charted values AND their per-year baselines, so nothing clips and the
  // y-axis never rescales when you re-select a season. A dropped outlier can't stretch it.
  const chartVals = chartable.map((x) => x[stat.key]).filter((v): v is number => v != null);
  const chartBaseVals = chartable.map((x) => baselineByYear.get(x.year) ?? null).filter((v): v is number => v != null);
  // 1.2 leaves headroom above the tallest dot; the trailing 0 guards Math.max on an empty set.
  const maxVal = Math.max(...chartVals, ...chartBaseVals, 0) * 1.2 || 1;

  const bars: StatBar[] = chartable.map((x) => {
    const v = x[stat.key] as number; // non-null by the chartable filter
    const b = baselineByYear.get(x.year) ?? null;
    const isSubject = x.year === subject.year;
    return {
      year: x.year,
      yy: String(x.year).slice(2),
      missed: false,
      played: true,
      isSubject,
      smallSample: false,
      selectable: true,
      valFmt: fmtV(v, stat.pct),
      baseFmt: b != null ? fmtV(b, stat.pct) : undefined,
      hPct: +((v / maxVal) * 100).toFixed(2),
      basePct: b != null ? +((b / maxVal) * 100).toFixed(2) : undefined,
      color: isSubject ? "var(--color-accent)" : "var(--color-neutral-500)",
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
      return {
        year: x.year,
        min: null,
        valFmt: "—",
        gp: null,
        made: null,
        att: null,
        deltaFmt: "—",
        deltaColor: "var(--color-neutral-700)",
        pctile: null,
        missed: true,
        smallSample: false,
        selectable: false,
        isSubject: false,
        reason: x.reason,
      };
    }
    const v = x[stat.key];
    const rowBase = baselineByYear.get(x.year) ?? null;
    const small = isStatSmallSample(x, ctx.league, stat.key);
    // Suppress the delta on a small-sample row — a "+64%" off a 1-of-1 season is exactly the
    // noise hidden everywhere else. The value + makes/attempts still show, so the reader sees
    // both the number and why it's untrustworthy.
    const rowHasDelta = !small && v != null && rowBase != null;
    const rowUp = rowHasDelta ? v - rowBase >= 0 : false;
    return {
      year: x.year,
      min: x.min,
      valFmt: fmtV(v, stat.pct),
      gp: x.gp,
      made: componentPair ? (x[componentPair.made] as number) : null,
      att: componentPair ? (x[componentPair.att] as number) : null,
      deltaFmt: rowHasDelta ? fmtRaw(v - rowBase, stat.pct) : "—",
      deltaColor: rowUp ? "var(--hm-above-text)" : "var(--hm-below-text)",
      pctile: !small && v != null ? pctileFor(x.year, v) : null,
      missed: false,
      smallSample: small,
      selectable: !small || !anyFull,
      isSubject: x.year === subject.year,
    };
  });

  return {
    year: subject.year,
    label: stat.label,
    short: stat.short,
    pct: stat.pct,
    curFmt: fmtV(cur, stat.pct),
    baseFmt: fmtV(base, stat.pct),
    rawFmt: hasDelta ? fmtRaw(cur - base, stat.pct) : "—",
    up,
    deltaColor: up ? "var(--hm-above-text)" : "var(--hm-below-text)",
    caption: buildCaption(ctx, player.name),
    component: componentPair
      ? { madeShort: componentPair.madeShort, attShort: componentPair.attShort, noun: componentPair.noun }
      : null,
    subjectSmallSample: subjectSmall,
    chartFallback,
    positionNote: ctx.positionSampleMissing
      ? `No same-position baseline for ${subject.year} — too few ${positionNoun(ctx.playerPosition)} on record that season.`
      : undefined,
    bars,
    // Table lists newest season first; the chart above stays left-to-right chronological.
    tableRows: [...tableRows].reverse(),
    axisTicks: [0, 50, 100].map((yPct) => ({ yPct, label: fmtV((maxVal * yPct) / 100, stat.pct) })),
  };
}
