import { Fragment } from "react";
import type { PlayerDetail } from "../data/api";
import { STATS } from "../data/stats";
import { firstName, isSmallSample, isStatSmallSample, ownStatAverage, playedSeasons, type League } from "../lib/deviation";
import { InfoTip } from "./InfoTip";
import { ScaleKey } from "./ScaleKey";

interface CareerHeatmapProps {
  player: PlayerDetail;
  league: League;
  subjectYear: number;
}

// Diverging scale endpoints + base are theme tokens (see --hm-* in theme.css), so the
// scale adapts light/dark. Red = above the player's career average, blue = below; each cell
// mixes its hue toward the base by the deviation magnitude.
const ABOVE = "var(--hm-above)";
const BELOW = "var(--hm-below)";
const HM_BASE = "var(--hm-base)";

// Max saturation a cell reaches (% toward the hue, away from the base). Capped below 100%
// so the in-cell number — drawn in var(--color-text), which flips with the theme — keeps
// ≥4.5:1 contrast on every cell in BOTH themes. A continuous base→hue gradient at full
// saturation passes through a mid-luminance band where neither dark nor white text can
// reach AA; 75% keeps the worst cell at ~4.7:1 while staying vivid.
const MAX_INTENSITY = 75;

/** The color ruler for a counting stat never gets more sensitive than this fraction of the
    league spread. So a stat whose whole career spans a league-trivial range (blocks bouncing
    0.1↔0.2) stays pale instead of painting tenths of a block as dramatic — the same
    league-yardstick idea as the deviation bars. It's a FLOOR on the own-range ruler (maxDev):
    a player with genuine season-to-season swings exceeds it and keeps their vivid trajectory.
    Tunable; 0.5 measured against Kelsey Mitchell's blocks (0.05–0.23 career range). */
const HEATMAP_STEP_FLOOR = 0.5;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const fmt = (v: number | null, pct: boolean) => (v == null ? "—" : pct ? `${Math.round(v * 100)}%` : v.toFixed(1));

/**
 * A season × stat grid where each cell is that year vs the player's own career
 * average for that stat (warm above / cool below), each stat scaled to its own spread.
 * Overview companion to the deviation bars.
 *
 * Intentionally plain <div>s, not a semantic <table>: the heatmap is a *visual* overview —
 * the color pattern is the payload — and every underlying value is available accessibly in
 * the drill-down table and the deviation bars. Table-navigating a grid of colors wouldn't
 * serve a screen-reader user, so we don't take on the cell-display complexity to fake table
 * semantics here. (A11y review 2026-08-27 — deliberate, not an oversight.)
 *
 * Laid out with **stats as columns (fixed 7) and years as rows** so the grid can never
 * overflow horizontally, however long the career or narrow the screen — long careers
 * grow downward instead (the earlier stats-as-columns layout scrolled sideways for
 * 14+ season players like Ogwumike/Taurasi, which we didn't want).
 *
 * Every year in the player's span is a row so the timeline never silently skips:
 *  - a missed season → empty gap cell,
 *  - a small-sample season (too few games) → greyed cell with its value (not heat-colored,
 *    so a tiny sample can't masquerade as a real trend),
 *  - a full season → heat-colored, and it's what feeds the career average.
 * Shown for players with ≥2 played seasons. The color scale is the same for everyone
 * (each stat is normalised to its own spread; no per-career softening).
 */
export function CareerHeatmap({ player, league, subjectYear }: CareerHeatmapProps) {
  const played = playedSeasons(player);
  if (played.length < 2) return null;

  const seasons = [...player.seasons].reverse(); // newest-first: latest year on top, descending

  // Each stat's center + spread are computed from only its own non-small-sample seasons, and
  // small-sample is per-stat now (few games for any stat, or too few attempts for a shooting %).
  // So a 1-for-1 = 100% three-point year is excluded from the 3P average AND from its spread —
  // it can't drag the baseline or stretch the color scale (which would wash out every real year).
  // Rate stats use the POOLED average (SUM(made)/SUM(att)); counting stats the plain mean.
  const statAgg = STATS.map((st) => {
    const comparable = played.filter((s) => !isStatSmallSample(s, league, st.key));
    // Fall back to all played if fewer than 2 seasons qualify for this stat.
    const basis = comparable.length >= 2 ? comparable : played;
    const avg = ownStatAverage(st.key, basis);
    const vals = basis.map((s) => s[st.key]).filter((v): v is number => v != null);
    const ownMaxDev = avg != null && vals.length ? Math.max(...vals.map((v) => Math.abs(v - avg)), 1e-9) : 1;
    // Floor the ruler at HEATMAP_STEP_FLOOR × the league spread so a league-trivial career range
    // can't saturate the color scale. Counting stats only (they carry a league step); rate stats
    // and pre-004 data have no step → keep the own-range ruler unchanged.
    const leagueStep = league.stdev(subjectYear, st.key);
    const maxDev = leagueStep != null ? Math.max(ownMaxDev, HEATMAP_STEP_FLOOR * leagueStep) : ownMaxDev;
    return { st, avg, maxDev };
  });
  const anySmall = played.some((s) => STATS.some((st) => isStatSmallSample(s, league, st.key)));

  return (
    <>
      <section aria-label="Career Trend" style={{ margin: "var(--space-1) 0 var(--space-1)" }}>
        <div style={{ marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontSize: "var(--fs-xl)", margin: 0 }}>Career Trend</h2>
          <div className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-2)" }}>Each cell vs {firstName(player.name)}'s career average.</div>
        </div>
        {/* Diverging color key — sits directly above the grid it describes. The small-sample
            key lives BELOW the grid (after it), like the drill-down's table key. */}
        <div className="scale-legend" style={{ marginBottom: "var(--space-4)" }}>
          <ScaleKey noun="baseline" />
        </div>

        {/* No overflow wrapper: with 7 fixed columns the grid fits from ~300px up, and an
            overflow container would clip the InfoTip header bubbles (they pop upward). The
            year column width + label form are responsive via CSS vars / media query below. */}
        <div className="heatmap" style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${STATS.length}, minmax(34px, 1fr))` }}>
          {/* Header row: corner + stat column labels (short, full name in a tooltip). */}
          <div />
          {STATS.map((st) => (
            <div key={`h-${st.key}`} className="hm-colhead">
              <InfoTip label={st.short} tip={st.desc} />
            </div>
          ))}

          {/* One row per season. Full year on wider screens, 2-digit on mobile (CSS-toggled). */}
          {seasons.map((s) => (
            <Fragment key={s.year}>
              <div className={"hm-rowhead" + (s.year === subjectYear ? " is-subject" : "")}>
                <span className="hm-year-full">{s.year}</span>
                <span className="hm-year-short">{`'${String(s.year).slice(2)}`}</span>
              </div>
              {statAgg.map(({ st, avg, maxDev }) => {
                const key = `${st.key}-${s.year}`;
                // Missed season → empty gap.
                if (!s.played) {
                  return <div key={key} className="hm-cell hm-empty" title={`${s.year}: did not play`}>—</div>;
                }
                const v = s[st.key] as number | null;
                const small = isStatSmallSample(s, league, st.key);
                // Too small a sample (or no value for this stat) → greyed, not heat-colored.
                if (small || v == null || avg == null) {
                  // Distinguish the reason so the tooltip is honest: too few games vs too few shots.
                  const reason = isSmallSample(s, league) ? `${s.gp} games` : "few attempts";
                  return (
                    <div
                      key={key}
                      className={"hm-cell hm-muted" + (small ? " hm-ss" : "")}
                      title={`${st.label} · ${s.year}: ${fmt(v, st.pct)}${small ? ` (small sample · ${reason})` : ""}`}
                    >
                      {fmt(v, st.pct)}
                    </div>
                  );
                }
                const t = clamp((v - avg) / maxDev, -1, 1);
                const intensity = Math.abs(t) * MAX_INTENSITY;
                const bg = `color-mix(in srgb, ${t >= 0 ? ABOVE : BELOW} ${intensity}%, ${HM_BASE})`;
                return (
                  <div
                    key={key}
                    className="hm-cell"
                    style={{ background: bg, color: "var(--color-text)" }}
                    title={`${st.label} · ${s.year}: ${fmt(v, st.pct)} · career avg ${fmt(avg, st.pct)}`}
                  >
                    {fmt(v, st.pct)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        {anySmall && (
          <div className="hm-legend-key text-muted" style={{ marginTop: "var(--space-3)" }}>
            <span className="hm-legend-dot" aria-hidden="true" /> small sample (few games or attempts)
          </div>
        )}
      </section>

      <hr style={{ border: 0, borderTop: "1px solid var(--color-divider)", margin: "var(--space-5) 0 var(--space-5)" }} />
    </>
  );
}
