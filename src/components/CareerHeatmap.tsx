import { Fragment } from "react";
import type { PlayerDetail } from "../data/api";
import { STATS } from "../data/stats";
import { isSmallSample, playedSeasons, type League } from "../lib/deviation";
import { InfoTip } from "./InfoTip";

interface CareerHeatmapProps {
  player: PlayerDetail;
  league: League;
  subjectYear: number;
}

// Diverging scale endpoints (fixed hues; the neutral midpoint is a theme token so it
// adapts to light/dark). Warm = above her career average, cool = below.
const WARM = "#c0492a";
const COOL = "#3f6d99";

// Max saturation a cell reaches (% toward the hue, away from the neutral base). Capped
// below 100% so the in-cell number — drawn in var(--color-text), which flips with the
// theme — keeps ≥4.5:1 contrast on every cell in BOTH themes. A continuous light→hue
// gradient at full saturation passes through a mid-luminance band where neither dark nor
// white text can reach AA; 75% keeps the worst cell at ~4.9:1 while staying vivid.
const MAX_INTENSITY = 75;

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const fmt = (v: number | null, pct: boolean) => (v == null ? "—" : pct ? `${Math.round(v * 100)}%` : v.toFixed(1));

/**
 * A season × stat grid where each cell is that year vs the player's own career
 * average for that stat (warm above / cool below), each stat scaled to its own spread.
 * Overview companion to the deviation bars.
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
  const comparable = played.filter((s) => !isSmallSample(s, league));
  // Career average comes from full seasons; fall back to all played if there aren't 2.
  const basis = comparable.length >= 2 ? comparable : played;
  const anySmall = played.some((s) => isSmallSample(s, league));

  // Stats are now the inner (column) axis, so precompute each stat's center/spread once.
  const statAgg = STATS.map((st) => {
    const vals = basis.map((s) => s[st.key]).filter((v): v is number => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const maxDev = vals.length ? Math.max(...vals.map((v) => Math.abs(v - avg!)), 1e-9) : 1;
    return { st, avg, maxDev };
  });

  return (
    <>
      <section aria-label="Career Trend" style={{ margin: "4px 0 2px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "10px 20px", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 20, margin: 0 }}>Career Trend</h2>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 3 }}>each cell vs her career average</div>
          </div>
          {/* Diverging color key — sits in the title row (compact) rather than below the grid. */}
          <div className="hm-legend">
            <div className="hm-scale-grad" aria-hidden="true" />
            <div className="hm-scale-ends text-muted">
              <span>&larr; <b>below</b> her average</span>
              <span><b>above</b> her average &rarr;</span>
            </div>
            {anySmall && (
              <div className="hm-legend-key text-muted">
                <span className="hm-legend-dot" aria-hidden="true" /> small sample (few games)
              </div>
            )}
          </div>
        </div>

        {/* No overflow wrapper: with 7 fixed columns the grid fits from ~300px up, and an
            overflow container would clip the InfoTip header bubbles (they pop upward). The
            year column width + label form are responsive via CSS vars / media query below. */}
        <div className="heatmap" style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${STATS.length}, minmax(34px, 1fr))` }}>
          {/* Header row: corner + stat column labels (short, full name in a tooltip). */}
          <div />
          {STATS.map((st) => (
            <div key={`h-${st.key}`} className="hm-colhead">
              <InfoTip label={st.short} tip={st.label} />
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
                const small = isSmallSample(s, league);
                // Too small a sample (or no value for this stat) → greyed, not heat-colored.
                if (small || v == null || avg == null) {
                  return (
                    <div
                      key={key}
                      className={"hm-cell hm-muted" + (small ? " hm-ss" : "")}
                      title={`${st.label} · ${s.year}: ${fmt(v, st.pct)}${small ? ` (small sample · ${s.gp} games)` : ""}`}
                    >
                      {fmt(v, st.pct)}
                    </div>
                  );
                }
                const t = clamp((v - avg) / maxDev, -1, 1);
                const intensity = Math.abs(t) * MAX_INTENSITY;
                const bg = `color-mix(in srgb, ${t >= 0 ? WARM : COOL} ${intensity}%, var(--color-neutral-100))`;
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
      </section>

      <hr style={{ border: 0, borderTop: "1px solid var(--color-divider)", margin: "20px 0 18px" }} />
    </>
  );
}
