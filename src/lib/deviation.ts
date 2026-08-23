import { STATS, type StatDef } from "../data/stats";
import type { LeagueSeason, PlayerDetail, SeasonMissed, SeasonPlayed } from "../data/api";

export type ComparisonWindow = "career" | "last5" | "last1";
export type ComparisonTarget = "own" | "league";

/** A season below this fraction of its year's scheduled games is "small sample" (D6).
    25% ≈ 11 of a 44-game season — a ~10–13 game year counts, a handful of games doesn't. */
const SMALL_SAMPLE_FRACTION = 0.25;
/** A full-length deviation bar = the stat is this fraction above/below baseline (S1). */
const BAR_FULL_SCALE = 0.5;
/** How many seasons the "last 5 years" window spans. */
const LAST5_WINDOW_SIZE = 5;
/** Fallback slate length for a year the league data doesn't list (shouldn't happen). */
const DEFAULT_SCHEDULED_GAMES = 40;

export type StatKey = StatDef["key"];

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
}

export function makeLeague(seasons: LeagueSeason[]): League {
  const byYear = new Map(seasons.map((s) => [s.year, s]));
  return {
    avg: (year, key) => byYear.get(year)?.[key] ?? null,
    scheduled: (year) => byYear.get(year)?.scheduledGames ?? DEFAULT_SCHEDULED_GAMES,
  };
}

export function fmtV(v: number | null | undefined, pct: boolean): string {
  if (v == null) return "—";
  return pct ? (v * 100).toFixed(1) + "%" : v.toFixed(1);
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

export interface WindowAvailability {
  career: boolean;
  last5: boolean;
  last1: boolean;
}

export interface BaselineContext {
  /** The league lookup this context was built with — downstream fns read it for averages. */
  league: League;
  /** The season under examination (the "subject"), defaulting to the latest played. */
  subject: SeasonPlayed;
  /** All played seasons before the subject, oldest first (includes small-sample ones). */
  history: SeasonPlayed[];
  /** History with small-sample seasons removed — what baseline averages are computed from. */
  eligibleHistory: SeasonPlayed[];
  effectiveTarget: ComparisonTarget;
  effectiveWindow: ComparisonWindow;
  /** The target/window the user actually requested, before any subject-level fallback.
      The drill-down's per-year baselines use these, so selecting a rookie season doesn't
      flip the whole chart to the league fallback. */
  requestedTarget: ComparisonTarget;
  requestedWindow: ComparisonWindow;
  /** True when "own" was requested but there is no prior season at all, so it fell back. */
  fallbackActive: boolean;
  /** Whether the player has any prior eligible season to anchor an own-baseline. */
  ownAvailable: boolean;
  windowAvailable: WindowAvailability;
  /** Prior eligible seasons feeding the current window (own mode). */
  windowedSeasons: SeasonPlayed[];
  /** Years feeding the current window (league mode averages league value over these). */
  windowedYears: number[];
  /** Human label of the span the current baseline covers, e.g. "2018–2024 · 7 seasons". */
  baselineSpanLabel: string;
  /** Season-length context for the games-played indicator (D6). */
  scheduled: number;
  subjectSmallSample: boolean;
  /** Prior played seasons excluded from baselines because they're small samples
      (shown as a disclaimer so a skipped year — e.g. a 13-game season — isn't confusing). */
  skippedSmallSampleSeasons: SeasonPlayed[];
  /** Gaps in the player's timeline (no data for that year). */
  missedSeasons: SeasonMissed[];
}

function pickWindow(seasons: SeasonPlayed[], window: ComparisonWindow): SeasonPlayed[] {
  if (window === "career") return seasons;
  if (window === "last5") return seasons.slice(-LAST5_WINDOW_SIZE);
  return seasons.slice(-1);
}

const WINDOW_FALLBACK_ORDER: ComparisonWindow[] = ["career", "last5", "last1"];

function spanLabel(years: number[]): string {
  if (years.length === 0) return "—";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max} · ${years.length} seasons`;
}

export function getBaselineContext(
  player: PlayerDetail,
  league: League,
  subjectYear: number,
  target: ComparisonTarget,
  window: ComparisonWindow,
): BaselineContext {
  const played = playedSeasons(player);
  const subject = played.find((s) => s.year === subjectYear) ?? played[played.length - 1];
  const history = played.filter((s) => s.year < subject.year);
  const eligibleHistory = history.filter((s) => !isSmallSample(s, league));
  const priorCount = eligibleHistory.length;

  const ownAvailable = priorCount >= 1;
  const effectiveTarget: ComparisonTarget = target === "own" && !ownAvailable ? "league" : target;
  const fallbackActive = target === "own" && !ownAvailable;

  // Only offer a window if it selects a *different* set of seasons than a narrower
  // one — otherwise two windows show the identical number. With N prior seasons:
  //   last year = 1 season       → needs N ≥ 1
  //   career    = all N seasons  → duplicates "last year" at N = 1, so needs N ≥ 2
  //   last 5    = 5 seasons      → duplicates "career" until N > 5, so needs N ≥ 6
  // League mode with no prior season still needs one option: the subject year itself.
  const windowAvailable: WindowAvailability =
    effectiveTarget === "league" && priorCount === 0
      ? { career: true, last5: false, last1: false }
      : { career: priorCount >= 2, last5: priorCount >= LAST5_WINDOW_SIZE + 1, last1: priorCount >= 1 };
  const effectiveWindow: ComparisonWindow = windowAvailable[window]
    ? window
    : (WINDOW_FALLBACK_ORDER.find((w) => windowAvailable[w]) ?? window);

  const windowedSeasons = pickWindow(eligibleHistory, effectiveWindow);
  const windowedYears = windowedSeasons.length ? windowedSeasons.map((s) => s.year) : [subject.year];

  return {
    league,
    subject,
    history,
    eligibleHistory,
    effectiveTarget,
    effectiveWindow,
    requestedTarget: target,
    requestedWindow: window,
    fallbackActive,
    ownAvailable,
    windowAvailable,
    windowedSeasons,
    windowedYears,
    baselineSpanLabel: spanLabel(windowedYears),
    scheduled: league.scheduled(subject.year),
    subjectSmallSample: isSmallSample(subject, league),
    skippedSmallSampleSeasons: history.filter((s) => isSmallSample(s, league)),
    missedSeasons: player.seasons.filter((s): s is SeasonMissed => !s.played),
  };
}

/** Mean of the non-null values; null when there are none to average. */
function average(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, x) => a + x, 0) / nums.length;
}

export function getBaselineValue(statKey: StatDef["key"], ctx: BaselineContext): number | null {
  if (ctx.effectiveTarget === "league") {
    return average(ctx.windowedYears.map((y) => ctx.league.avg(y, statKey)));
  }
  const arr = ctx.windowedSeasons;
  if (arr.length === 0) return ctx.league.avg(ctx.subject.year, statKey);
  return average(arr.map((s) => s[statKey]));
}

export interface DeviationRow {
  key: StatDef["key"];
  short: string;
  label: string;
  curVal: number | null;
  baseVal: number | null;
  curFmt: string;
  baseFmt: string;
  rawFmt: string;
  up: boolean;
  /** Bar length as a percent of the row's half-width (0–50). */
  barPct: number;
  /** Left edge of the bar as a percent of the row width. */
  leftPct: number;
  barColor: string;
  deltaColor: string;
}

/** Bar geometry: relative deviation clamped at ±BAR_FULL_SCALE, centered on the baseline. */
function barGeometry(cur: number | null, base: number | null): { up: boolean; barPct: number; leftPct: number } {
  if (cur == null || base == null) return { up: false, barPct: 0, leftPct: 50 };
  const ratio = base ? (cur - base) / base : 0;
  const barPct = +(Math.min(Math.abs(ratio) / BAR_FULL_SCALE, 1) * 50).toFixed(2);
  const up = cur - base >= 0;
  return { up, barPct, leftPct: up ? 50 : 50 - barPct };
}

export function buildRows(ctx: BaselineContext): DeviationRow[] {
  const { subject } = ctx;
  return STATS.map((st) => {
    const cur = subject[st.key];
    const base = getBaselineValue(st.key, ctx);
    const { up, barPct, leftPct } = barGeometry(cur, base);
    const hasDelta = cur != null && base != null;
    return {
      key: st.key,
      short: st.short,
      label: st.label,
      curVal: cur,
      baseVal: base,
      curFmt: fmtV(cur, st.pct),
      baseFmt: fmtV(base, st.pct),
      rawFmt: hasDelta ? fmtRaw(cur - base, st.pct) : "—",
      up,
      barPct,
      leftPct,
      barColor: up ? "var(--color-accent)" : "var(--color-neutral-600)",
      deltaColor: up ? "var(--color-accent-700)" : "var(--color-neutral-700)",
    };
  });
}

const WINDOW_LABEL: Record<ComparisonWindow, string> = {
  career: "career",
  last5: "last 5 seasons",
  last1: "last season",
};

export function buildCaption(ctx: BaselineContext): string {
  const { subject, effectiveTarget, effectiveWindow, baselineSpanLabel } = ctx;
  const win = WINDOW_LABEL[effectiveWindow];
  return effectiveTarget === "league"
    ? `Comparing ${subject.year} against the WNBA league average — ${win} (${baselineSpanLabel}).`
    : `Comparing ${subject.year} against her own ${win} (${baselineSpanLabel}).`;
}

export interface StatBar {
  year: number;
  yy: string;
  missed: boolean;
  played: boolean;
  isSubject: boolean;
  reason?: string;
  valFmt?: string;
  /** Value's height as a percent of the chart height (the line point). */
  hPct?: number;
  /** This season's OWN baseline height (percent) — the per-year tick. Undefined = no
      baseline for this season (e.g. a rookie year with no prior history to average). */
  basePct?: number;
  smallSample?: boolean;
  color?: string;
  /** Played season with no value for THIS stat (e.g. 0 three-point attempts) — render an empty slot. */
  noValue?: boolean;
}

export interface StatTableRow {
  year: number;
  min: number | null; // per-game minutes; null ~10% of seasons
  valFmt: string;
  gp: number | null;
  deltaFmt: string;
  deltaColor: string;
  missed: boolean;
  smallSample: boolean;
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
  bars: StatBar[];
  tableRows: StatTableRow[];
  /** Y-axis gridline levels: yPct (0 = bottom, 100 = top of scale) + formatted label. */
  axisTicks: { yPct: number; label: string }[];
}

export function buildStatDetail(player: PlayerDetail, stat: StatDef, ctx: BaselineContext): StatDetail {
  const { subject } = ctx;
  const cur = subject[stat.key];

  const allPlayed = playedSeasons(player);
  // Use the REQUESTED target/window (not the subject-level effective fallback) so that
  // selecting a rookie season keeps the whole chart on "her own" instead of flipping to
  // league. Each season's baseline still handles its own no-history case (uses its value).
  const target = ctx.requestedTarget;
  const window = ctx.requestedWindow;

  // Each season's OWN baseline, computed relative to that season (its prior window),
  // using the same target/window the summary shows. Drawn as a per-year tick, so the
  // chart is static — selecting a season never moves a shared baseline. An "own"
  // baseline is null when the season has no prior eligible history (e.g. a rookie
  // year) → no tick, per product decision. (League always has a value that year.)
  const baselineByYear = new Map<number, number | null>();
  for (const s of allPlayed) {
    const priorEligible = allPlayed.filter((p) => p.year < s.year && !isSmallSample(p, ctx.league));
    const windowed = pickWindow(priorEligible, window);
    let b: number | null;
    if (target === "league") {
      const years = windowed.length ? windowed.map((w) => w.year) : [s.year];
      b = average(years.map((y) => ctx.league.avg(y, stat.key)));
    } else {
      // Own baseline. A first season has no prior history to average → use its own value,
      // so its baseline dot sits on its value dot (zero deviation) rather than being absent.
      b = windowed.length ? average(windowed.map((w) => w[stat.key])) : (s[stat.key] ?? null);
    }
    baselineByYear.set(s.year, b);
  }

  // Header + table compare against the SAME per-year baseline the chart draws for the
  // subject (keeps all three consistent), instead of a separately-computed value.
  const base = baselineByYear.get(subject.year) ?? null;
  const hasDelta = cur != null && base != null;
  const up = hasDelta ? cur - base >= 0 : false;

  // Scale spans values AND per-year baselines (all static) so nothing clips and the
  // y-axis never rescales when you re-select a season.
  const statVals = allPlayed.map((x) => x[stat.key]).filter((v): v is number => v != null);
  const baseVals = [...baselineByYear.values()].filter((v): v is number => v != null);
  // 1.2 leaves headroom above the tallest dot so the selected value label doesn't crowd
  // the top gridline.
  const maxVal = Math.max(...statVals, ...baseVals) * 1.2 || 1;

  const bars: StatBar[] = player.seasons.map((x) => {
    const yy = String(x.year).slice(2);
    if (!x.played) {
      return { year: x.year, yy, missed: true, played: false, isSubject: false, reason: x.reason };
    }
    const v = x[stat.key];
    const small = isSmallSample(x, ctx.league);
    const isSubject = x.year === subject.year;
    if (v == null) {
      // Played, but no value for THIS stat — empty slot, distinct from a missed season.
      return { year: x.year, yy, missed: false, played: true, isSubject, smallSample: small, noValue: true, valFmt: "—" };
    }
    const b = baselineByYear.get(x.year) ?? null;
    return {
      year: x.year,
      yy,
      missed: false,
      played: true,
      isSubject,
      smallSample: small,
      valFmt: fmtV(v, stat.pct),
      hPct: +((v / maxVal) * 100).toFixed(2),
      basePct: b != null ? +((b / maxVal) * 100).toFixed(2) : undefined,
      color: isSubject
        ? "var(--color-accent)"
        : small
          ? "var(--color-neutral-400)"
          : "var(--color-neutral-500)",
    };
  });

  const tableRows: StatTableRow[] = player.seasons.map((x) => {
    if (!x.played) {
      return {
        year: x.year,
        min: null,
        valFmt: "—",
        gp: null,
        deltaFmt: "—",
        deltaColor: "var(--color-neutral-700)",
        missed: true,
        smallSample: false,
        isSubject: false,
        reason: x.reason,
      };
    }
    const v = x[stat.key];
    const rowBase = baselineByYear.get(x.year) ?? null;
    const rowHasDelta = v != null && rowBase != null;
    const rowUp = rowHasDelta ? v - rowBase >= 0 : false;
    return {
      year: x.year,
      min: x.min,
      valFmt: fmtV(v, stat.pct),
      gp: x.gp,
      deltaFmt: rowHasDelta ? fmtRaw(v - rowBase, stat.pct) : "—",
      deltaColor: rowUp ? "var(--color-accent-700)" : "var(--color-neutral-700)",
      missed: false,
      smallSample: isSmallSample(x, ctx.league),
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
    deltaColor: up ? "var(--color-accent-700)" : "var(--color-neutral-700)",
    caption: buildCaption(ctx),
    bars,
    // Table lists newest season first; the chart above stays left-to-right chronological.
    tableRows: [...tableRows].reverse(),
    axisTicks: [0, 50, 100].map((yPct) => ({ yPct, label: fmtV((maxVal * yPct) / 100, stat.pct) })),
  };
}
