import { STATS, type StatDef } from "../data/stats";
import type { LeagueSeason, PlayerDetail, PositionSeason, SeasonMissed, SeasonPlayed } from "../data/api";

// "thisYear" compares the subject season to that SAME year's league/position peers (e.g.
// 2026 vs. other 2026 forwards). It's meaningful only for the external baselines — comparing
// a season to itself under "own" is always zero — so it's offered only when the target is
// league or position.
export type ComparisonWindow = "career" | "last5" | "last1" | "thisYear";
export type ComparisonTarget = "own" | "league" | "position";

/** A season below this fraction of its year's scheduled games is "small sample" (D6).
    25% ≈ 11 of a 44-game season — a ~10–13 game year counts, a handful of games doesn't.
    Must stay equal to wnba-data's SMALL_SAMPLE_FRACTION (scripts/compute-league.ts), which
    uses the same bar to pick which players qualify for the league averages. Keep them paired. */
const SMALL_SAMPLE_FRACTION = 0.25;
/** A full-length deviation bar = the stat is this fraction above/below baseline (S1). */
const BAR_FULL_SCALE = 0.5;
/** How many seasons the "last 5 years" window spans. */
const LAST5_WINDOW_SIZE = 5;
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

/** Per-(year, position) average lookup, built from the API's /positions data. */
export interface PositionLookup {
  /** Average of a stat for players at `position` in `year`; null if that (year, position)
      bucket has no row (too small a sample — the API omits it). */
  avg(year: number, position: string, key: StatKey): number | null;
}

export function makePositionLookup(seasons: PositionSeason[]): PositionLookup {
  const byKey = new Map(seasons.map((s) => [`${s.year}|${s.position}`, s]));
  return {
    avg: (year, position, key) => byKey.get(`${year}|${position}`)?.[key] ?? null,
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

export interface WindowAvailability {
  career: boolean;
  last5: boolean;
  last1: boolean;
  /** The subject season vs. the same year's peers — league/position only. */
  thisYear: boolean;
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
  /** Whether the position baseline can be offered at all (the player has a known position). */
  positionAvailable: boolean;
  /** True in position mode when the subject's windowed baseline has no same-position sample
      (every windowed year's bucket is absent) — the UI shows a "no sample" note. */
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
  /** Gaps in the player's timeline (no data for that year). */
  missedSeasons: SeasonMissed[];
}

function pickWindow(seasons: SeasonPlayed[], window: ComparisonWindow): SeasonPlayed[] {
  // "thisYear" isn't a span of prior seasons — it resolves to the subject year alone, which
  // the caller handles by falling back to [subject.year] when this returns nothing.
  if (window === "thisYear") return [];
  if (window === "career") return seasons;
  if (window === "last5") return seasons.slice(-LAST5_WINDOW_SIZE);
  return seasons.slice(-1);
}

// Fallback order when the requested window isn't available for the subject. "thisYear" is
// last so a broad request (e.g. last5 with too few priors) drops to a narrower prior-based
// window before ever collapsing to a single year — it's only reached when nothing else fits
// (an external baseline for a first-season player).
const WINDOW_FALLBACK_ORDER: ComparisonWindow[] = ["career", "last5", "last1", "thisYear"];

function spanLabel(years: number[]): string {
  if (years.length === 0) return "—";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max} · ${years.length} seasons`;
}

export function getBaselineContext(
  player: PlayerDetail,
  league: League,
  positions: PositionLookup | null,
  subjectYear: number | null,
  target: ComparisonTarget,
  window: ComparisonWindow,
): BaselineContext {
  const played = playedSeasons(player);
  // Only full (non-small-sample) seasons are selectable as the subject — a handful of
  // games makes a misleading analysis. Fall back to every played season if the player has
  // no full season at all, so their page still renders.
  const fullSeasons = played.filter((s) => !isSmallSample(s, league));
  const selectable = fullSeasons.length > 0 ? fullSeasons : played;
  const subject = selectable.find((s) => s.year === subjectYear) ?? selectable[selectable.length - 1];
  const history = played.filter((s) => s.year < subject.year);
  const eligibleHistory = history.filter((s) => !isSmallSample(s, league));
  const priorCount = eligibleHistory.length;

  const ownAvailable = priorCount >= 1;
  // "own" is the only target that can fall back (to league) when there's no prior season;
  // "league" and "position" pass through unchanged (position never auto-falls back — a
  // missing same-position sample shows a note instead, per product decision).
  const effectiveTarget: ComparisonTarget = target === "own" && !ownAvailable ? "league" : target;
  const fallbackActive = target === "own" && !ownAvailable;

  const playerPosition = player.pos;
  const positionAvailable = playerPosition != null && positions != null;

  // Only offer a prior-based window if it selects a *different* set of seasons than a
  // narrower one — otherwise two windows show the identical number. With N prior seasons:
  //   last year = 1 season       → needs N ≥ 1
  //   career    = all N seasons  → duplicates "last year" at N = 1, so needs N ≥ 2
  //   last 5    = 5 seasons      → duplicates "career" until N > 5, so needs N ≥ 6
  // "This season" is a different axis — the subject year vs. that year's peers — so it's
  // offered whenever the baseline is external (league/position), regardless of prior count.
  // It also covers the first-season case that would otherwise have no external option.
  const usesExternalBaseline = effectiveTarget === "league" || effectiveTarget === "position";
  const windowAvailable: WindowAvailability = {
    career: priorCount >= 2,
    last5: priorCount >= LAST5_WINDOW_SIZE + 1,
    last1: priorCount >= 1,
    thisYear: usesExternalBaseline,
  };
  const effectiveWindow: ComparisonWindow = windowAvailable[window]
    ? window
    : (WINDOW_FALLBACK_ORDER.find((w) => windowAvailable[w]) ?? window);

  const windowedSeasons = pickWindow(eligibleHistory, effectiveWindow);
  const windowedYears = windowedSeasons.length ? windowedSeasons.map((s) => s.year) : [subject.year];

  // In position mode, is there actually a same-position sample for the subject's window?
  // (Uses "pts" as a witness — if the (year, position) row exists, all its stats do.)
  const positionBaseline =
    effectiveTarget === "position" && playerPosition != null && positions != null
      ? average(windowedYears.map((y) => positions.avg(y, playerPosition, "pts")))
      : null;
  const positionSampleMissing = effectiveTarget === "position" && positionBaseline == null;

  return {
    league,
    positions,
    playerPosition,
    positionAvailable,
    positionSampleMissing,
    subject,
    selectableYears: [...selectable].map((s) => s.year).reverse(),
    nonSelectableSmallSample: fullSeasons.length > 0 ? played.filter((s) => isSmallSample(s, league)) : [],
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
  if (ctx.effectiveTarget === "league") {
    return average(ctx.windowedYears.map((y) => ctx.league.avg(y, statKey)));
  }
  if (ctx.effectiveTarget === "position") {
    const pos = ctx.playerPosition;
    const lookup = ctx.positions;
    if (pos == null || lookup == null) return null;
    return average(ctx.windowedYears.map((y) => lookup.avg(y, pos, statKey)));
  }
  // Pool rate stats from totals, but only over seasons that are a real sample for this stat —
  // a window of only attempt-thin seasons would otherwise pool to noise. If nothing eligible
  // remains (a first real season with no prior history), the baseline is null — the summary
  // then shows "—" and no bar, since there's nothing to be above or below.
  const arr = ctx.windowedSeasons.filter((s) => !isStatSmallSample(s, ctx.league, statKey));
  if (arr.length === 0) return null;
  return ownStatAverage(statKey, arr);
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
  /** True when the subject season is too thin a sample for THIS stat (few games, or for a
      shooting % too few attempts) — the deviation isn't meaningful, so the view shows a
      "small sample" note instead of a bar. */
  smallSample: boolean;
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
    // Too few attempts (or games) for this stat → the subject value is noise, so no bar/delta.
    const smallSample = isStatSmallSample(subject, ctx.league, st.key);
    const { up, barPct, leftPct } = smallSample ? { up: false, barPct: 0, leftPct: 50 } : barGeometry(cur, base);
    const hasDelta = !smallSample && cur != null && base != null;
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
      barColor: up ? "var(--hm-above)" : "var(--hm-below)",
      deltaColor: up ? "var(--hm-above-text)" : "var(--hm-below-text)",
      smallSample,
    };
  });
}

const WINDOW_LABEL: Record<ComparisonWindow, string> = {
  career: "career",
  last5: "previous 5 seasons",
  last1: "previous season",
  thisYear: "this season",
};

export function buildCaption(ctx: BaselineContext, playerName: string): string {
  const { subject, effectiveTarget, effectiveWindow, baselineSpanLabel, playerPosition } = ctx;
  const win = WINDOW_LABEL[effectiveWindow];
  if (effectiveTarget === "league")
    return `Comparing ${subject.year} against the WNBA league average — ${win} (${baselineSpanLabel}).`;
  if (effectiveTarget === "position")
    return `Comparing ${subject.year} against other ${positionNoun(playerPosition)} — ${win} (${baselineSpanLabel}).`;
  return `Comparing ${subject.year} against ${firstName(playerName)}'s own ${win} (${baselineSpanLabel}).`;
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
  /** This season's OWN baseline height (percent) — the per-year tick. Undefined = no
      baseline for this season (e.g. a rookie year with no prior history to average). */
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
    } else if (target === "position") {
      // Same shape as league, but the same-position average per year. A year with no
      // same-position sample contributes null and drops out (or leaves no tick).
      const pos = ctx.playerPosition;
      const lookup = ctx.positions;
      const years = windowed.length ? windowed.map((w) => w.year) : [s.year];
      b = pos == null || lookup == null ? null : average(years.map((y) => lookup.avg(y, pos, stat.key)));
    } else {
      // Own baseline. Pool rate stats from totals, but ONLY over seasons that are themselves a
      // real sample for this stat — otherwise a window made up entirely of attempt-thin seasons
      // (e.g. A'ja Wilson's pre-2022 threes, 0/0–1/1) would pool to garbage like 50%. When
      // nothing eligible remains (a first real season, with no prior history to compare against),
      // the baseline is null → the chart draws no baseline dot and the value dot is neutral,
      // because a first season can't be above or below a baseline that doesn't exist yet.
      const ownWindowed = windowed.filter((w) => !isStatSmallSample(w, ctx.league, stat.key));
      b = ownWindowed.length ? ownStatAverage(stat.key, ownWindowed) : null;
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
