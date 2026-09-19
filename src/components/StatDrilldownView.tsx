import type { PlayerDetail } from "../data/api";
import { STATS, statDescBody } from "../data/stats";
import {
  compareOptions,
  firstName,
  ordinal,
  positionNoun,
  scaleNoun,
  selfModeAvailable,
  type HeatmapMode,
  type StatDetail,
  type StatKey,
  type StatTableRow,
} from "../lib/deviation";
import { CareerSummary } from "./CareerSummary";
import { InfoTip } from "./InfoTip";
import { LabeledSelect } from "./Select";

interface StatDrilldownViewProps {
  player: PlayerDetail;
  stat: StatDetail;
  /** Which stat is shown — drives the section's stat dropdown. */
  statKey: StatKey;
  /** The stat's one-line description (STATS[].desc); shown under its name without the lead-in. */
  desc: string;
  /** The page's reference mode. The section shows a second, synced "Compare to" control so the
      reader can switch without scrolling back to the heatmap; both write the same URL state. */
  mode: HeatmapMode;
  positionAvailable: boolean;
  onStatChange: (key: StatKey) => void;
  onModeChange: (mode: HeatmapMode) => void;
}

const PLOT_H = 220; // px

/**
 * One stat's year-by-year history — the career at a glance (plates), a per-season dumbbell chart
 * (the season's value vs. its reference, with the comparison group's middle 80% banded behind
 * it), and the full yearly table. A **section of the player page**, below the heatmap, not its
 * own route: the heatmap is the overview, this is the detail for the one stat in the dropdown
 * (or reached via a heatmap cell's "See … history" link / Enter). The heading has tabIndex=-1 so
 * that link can move focus here for keyboard/screen-reader users.
 */
export function StatDrilldownView({ player, stat, statKey, desc, mode, positionAvailable, onStatChange, onModeChange }: StatDrilldownViewProps) {
  const bars = stat.bars;
  const n = bars.length;
  const colX = (i: number) => ((i + 0.5) / n) * 100; // column center, % from left
  // Whether any table row is a small sample → show the dot key below the table. Wording is
  // stat-aware: a shooting % can be thin on games OR attempts; a counting stat only on games.
  const anySmallRow = stat.tableRows.some((r) => r.smallSample && !r.missed);
  const smallSampleKey = stat.component ? "small sample (few games or attempts)" : "small sample (few games)";
  // The percentile ("Pct") column shows only in the peer modes for counting stats (shooting %s
  // and self mode have no ladder); the rank column whenever the API sent a rank.
  const showPct = stat.tableRows.some((r) => r.pctile != null);
  const showRank = stat.tableRows.some((r) => r.rank != null);
  const pctWhere = mode === "position" ? `among ${positionNoun(player.pos)}` : "in the league";
  const groupNoun = mode === "position" ? positionNoun(player.pos) : "the league";
  const refNoun = scaleNoun(mode, player.pos);
  const modeOptions = compareOptions(selfModeAvailable(player), positionAvailable, player.pos);

  // The band: one faint polygon through every charted season that has a ladder (top edge = 90th
  // percentile, bottom = 10th), the median dotted. Drawn in percent coordinates on an SVG that
  // stretches to the plot, behind the columns.
  const banded = bars.map((b, i) => ({ b, i })).filter(({ b }) => b.band != null);
  const bandPoints =
    banded.length >= 2
      ? [
          ...banded.map(({ b, i }) => `${colX(i)},${100 - b.band!.hiPct}`),
          ...banded.map(({ b, i }) => `${colX(i)},${100 - b.band!.loPct}`).reverse(),
        ].join(" ")
      : null;
  const medianPoints = banded.map(({ b, i }) => `${colX(i)},${100 - b.band!.midPct}`).join(" ");

  const renderRow = (r: StatTableRow) => (
    <tr key={r.year}>
      <td>
        {r.year}
        {r.smallSample && !r.missed && (
          // Just a dot (keyed below the table) — the repeated "small sample" text wrapped the
          // year to two lines. role/aria-label keep it meaningful without visible text.
          <span className="hm-legend-dot" role="img" aria-label="small sample" style={{ marginLeft: "var(--space-2)" }} />
        )}
      </td>
      {stat.component && (
        <>
          <td className="text-muted">{r.missed || r.made == null ? "—" : r.made}</td>
          <td className="text-muted">{r.missed || r.att == null ? "—" : r.att}</td>
        </>
      )}
      <td className={r.missed ? "text-muted" : undefined}>{r.valFmt}</td>
      <td className="text-muted">{r.gp ?? "—"}</td>
      <td className="text-muted">{r.min != null ? r.min.toFixed(1) : "—"}</td>
      {showPct && <td>{r.pctile != null ? ordinal(Math.round(r.pctile)) : <span className="text-muted">—</span>}</td>}
      {showRank && (
        <td className="nowrap">
          {r.rank != null && r.pool != null ? (
            <>
              {ordinal(r.rank)} <span className="text-muted">of {r.pool}</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      )}
      <td style={{ color: r.missed ? undefined : r.deltaColor }}>{r.deltaFmt}</td>
    </tr>
  );

  return (
    <section
      id="drilldown"
      aria-labelledby="drilldown-title"
      style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "2px solid var(--color-divider)" }}
    >
      {/* Header row, like the heatmap's: name + description on the left, the section's two
          controls on the right (they wrap under the description on a phone). The controls sit
          ABOVE everything they change — the plates, the chart, the table — not below the plates,
          where flipping one changed content the reader had already passed. The comparison control
          is a synced copy of the page's: changing it here changes the heatmap too (one state). */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div>
          {/* tabIndex=-1: a programmatic focus target for the heatmap's "See … history" link. */}
          <h2 id="drilldown-title" tabIndex={-1} style={{ margin: 0, fontSize: "var(--fs-2xl)" }}>
            {stat.label}
          </h2>
          {/* The description without its "Points — " lead-in: the heading already says the name. */}
          <div className="text-muted" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--space-1)" }}>
            {statDescBody(desc)}
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <LabeledSelect label="Stat" value={statKey} options={STATS.map((s) => ({ value: s.key, label: s.label }))} onChange={(v) => onStatChange(v as StatKey)} />
          <LabeledSelect label="Compare to" value={mode} options={modeOptions} onChange={(v) => onModeChange(v as HeatmapMode)} />
        </div>
      </div>

      {stat.summary && <CareerSummary summary={stat.summary} unit={stat.unit} mode={mode} />}

      {/* Scoped to what follows ("each season below") so it can't read as a description of the
          plates above it — they are career facts, not per-season comparisons. */}
      <p className="text-muted" style={{ fontSize: "var(--fs-sm)", margin: `var(--space-4) 0 ${stat.positionNote ? "var(--space-2)" : "var(--space-4)"}` }}>
        {stat.caption}
      </p>
      {stat.positionNote && (
        <div role="note" className="note-card" style={{ margin: "0 0 var(--space-5)" }}>
          {stat.positionNote}
        </div>
      )}

      {/* Legend for the chart. */}
      <div style={{ marginBottom: "var(--space-3)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-4)", fontSize: "var(--fs-xs)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--hm-above)" }} />
            Above {refNoun}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--hm-below)" }} />
            Below {refNoun}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--color-neutral-600)" }} />
            {refNoun.charAt(0).toUpperCase() + refNoun.slice(1)}
          </span>
          {stat.hasBand && (
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span aria-hidden="true" className="legend-band" />
              Middle 80% of {groupNoun} that year
            </span>
          )}
        </div>
      </div>

      {/* The plot is decorative for assistive tech: every number it draws is in the table below,
          and the note under it explains the band. Hover titles serve mouse users. */}
      <div className="card" aria-hidden="true" style={{ padding: "var(--space-5) var(--space-5) var(--space-3)" }}>
        {stat.chartFallback ? (
          <div className="text-muted" style={{ padding: "var(--space-12) var(--space-2)", textAlign: "center", fontSize: "var(--fs-sm)" }}>
            {stat.chartFallback}
          </div>
        ) : (
          <>
            <div style={{ position: "relative", height: PLOT_H, paddingLeft: "var(--space-1)" }}>
              {/* Gridlines + y-axis labels */}
              {stat.axisTicks.map((t) => (
                <div
                  key={t.label + t.yPct}
                  style={{ position: "absolute", left: 0, right: 0, top: `${100 - t.yPct}%`, borderTop: "1px solid var(--color-divider)" }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: -7,
                      fontSize: "var(--fs-3xs)",
                      color: "var(--color-neutral-700)",
                      background: "var(--color-bg)",
                      paddingRight: "var(--space-1)",
                    }}
                  >
                    {t.label}
                  </span>
                </div>
              ))}

              {/* The comparison group's middle 80% each year, behind everything else. */}
              {bandPoints && (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, overflow: "visible" }}
                >
                  <polygon points={bandPoints} className="dd-band" />
                  <polyline points={medianPoints} className="dd-median" />
                </svg>
              )}

              {/* Vertical column dividers between seasons */}
              {bars.map((_, i) =>
                i > 0 ? (
                  <div
                    key={`vg-${i}`}
                    style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / n) * 100}%`, borderLeft: "1px solid var(--color-divider)", zIndex: 2 }}
                  />
                ) : null,
              )}

              {/* One column per season: the value dot and the reference dot, joined by a vertical
                  connector (the gap = that season's deviation). */}
              {bars.map((b, i) => {
                const yVal = 100 - b.hPct;
                const yBase = b.basePct != null ? 100 - b.basePct : null;
                const dot = 10;
                return (
                  <div
                    key={b.year}
                    title={`${b.year}: ${b.valFmt} · ${refNoun} ${b.baseFmt ?? "—"}`}
                    style={{ position: "absolute", left: `${colX(i)}%`, top: 0, height: "100%", width: `${100 / n}%`, transform: "translateX(-50%)", zIndex: 3 }}
                  >
                    {yBase != null && (
                      <span
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: `${Math.min(yVal, yBase)}%`,
                          height: `${Math.abs(yVal - yBase)}%`,
                          width: 0,
                          borderLeft: "1.5px solid var(--color-neutral-500)",
                          transform: "translateX(-50%)",
                        }}
                      />
                    )}
                    {yBase != null && (
                      <span
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: `${yBase}%`,
                          width: dot,
                          height: dot,
                          borderRadius: "50%",
                          background: "var(--color-neutral-600)",
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    )}
                    <span
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: `${yVal}%`,
                        width: dot,
                        height: dot,
                        borderRadius: "50%",
                        // Red above the reference, blue below; a season with no reference (a
                        // position-year with no bucket) is neutral grey.
                        background: b.up == null ? "var(--color-neutral-500)" : b.up ? "var(--hm-above)" : "var(--hm-below)",
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-axis year labels */}
            <div style={{ display: "flex", marginTop: "var(--space-2)" }}>
              {bars.map((b) => (
                <div key={b.year} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                  <span className="text-muted" style={{ fontSize: "var(--fs-3xs)" }}>
                    '{b.yy}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {!stat.chartFallback && (
        <p className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-4)" }}>
          Each season shows two dots — {firstName(player.name)}'s {stat.label.toLowerCase()} (red above the {refNoun}, blue below) and grey = the {refNoun}; the gap between them is that season's deviation.
          {stat.hasBand && ` The shaded band is the middle 80% of ${groupNoun} that year, its median dotted.`} Hover a season to read its numbers. Low-sample seasons are left off the chart — the table below has the full history.
        </p>
      )}

      {/* Yearly table — one full-width table, zebra-striped. table-layout: fixed gives evenly
          distributed columns and makes the table fit its container at any width. Missed seasons
          show as "—" rows; the page-level note above the section carries the reason. */}
      <div style={{ marginTop: "var(--space-6)" }}>
        <table className="table" aria-label="Season stats">
          <thead>
            <tr>
              <th scope="col">Season</th>
              {stat.component && (
                <>
                  <th scope="col">
                    <InfoTip label={stat.component.madeShort} tip={`${stat.component.noun} made that season`} />
                  </th>
                  <th scope="col">
                    <InfoTip label={stat.component.attShort} tip={`${stat.component.noun} attempted that season`} />
                  </th>
                </>
              )}
              <th scope="col">{stat.short}</th>
              <th scope="col">
                <InfoTip label="GP" tip="Games played that season" />
              </th>
              <th scope="col">
                <InfoTip label="Min" tip="Minutes played per game" />
              </th>
              {showPct && (
                <th scope="col">
                  <InfoTip label="Pct" tip={`This season's percentile ${pctWhere}`} />
                </th>
              )}
              {showRank && (
                <th scope="col">
                  <InfoTip label="Rank" tip="League rank that season among the players who qualified for the league averages (1st = best); the pool is everyone in this dataset that year" />
                </th>
              )}
              <th scope="col">
                <InfoTip label="vs avg" tip={`How far above or below the ${refNoun} that season`} />
              </th>
            </tr>
          </thead>
          <tbody>{stat.tableRows.map(renderRow)}</tbody>
        </table>
        {anySmallRow && (
          <div className="hm-legend-key text-muted" style={{ marginTop: "var(--space-3)" }}>
            <span className="hm-legend-dot" aria-hidden="true" /> {smallSampleKey}
          </div>
        )}
      </div>
    </section>
  );
}
