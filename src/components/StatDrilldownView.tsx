import { useEffect, useRef, useState } from "react";
import type { PlayerDetail } from "../data/api";
import { STATS, statDescBody } from "../data/stats";
import {
  ordinal,
  positionNoun,
  scaleNoun,
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
  /** The page's reference mode — set in the sticky CompareBar, which stays in reach while the
      reader is down here (it replaced a synced second dropdown in this header). */
  mode: HeatmapMode;
  onStatChange: (key: StatKey) => void;
}

const PLOT_H = 220; // px
const LABEL_GAP = 12; // px from a dot's center to its value label
// The narrowest a season column gets before the plot scrolls sideways (phones): a value label is
// 17–19px wide, so 22 leaves neighbours 3px apart. Ten columns fit a 320px phone; more scroll.
const COL_MIN = 22; // px

/**
 * One stat's year-by-year history — the career at a glance (plates), a per-season dumbbell chart
 * (the season's value vs. its reference, with the comparison group's middle 80% banded behind
 * it), and the full yearly table. A **section of the player page**, below the heatmap, not its
 * own route: the heatmap is the overview, this is the detail for the one stat in the dropdown
 * (or reached via a heatmap cell's "See … history" link / Enter). The heading has tabIndex=-1 so
 * that link can move focus here for keyboard/screen-reader users.
 */
export function StatDrilldownView({ player, stat, statKey, desc, mode, onStatChange }: StatDrilldownViewProps) {
  const bars = stat.bars;
  const n = bars.length;
  // Click a chart column → that year's row lights up in the table (and the column itself), so a
  // reader can find one season's numbers without counting rows. Transient (not in the URL), a
  // second click clears it, and it survives a stat change (every stat has the same years). Pointer
  // only, on purpose: the chart is aria-hidden and its columns are not focusable, so keyboard and
  // screen-reader users — who read the table directly — see no change.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const toggleYear = (year: number) => setSelectedYear((cur) => (cur === year ? null : year));
  // Bring the highlighted row into view when it isn't already (on a phone the table is a screen
  // below the chart). Left alone when the row is fully visible, as on a desktop; otherwise centered
  // — "nearest" would park it on the viewport's bottom edge, under a phone browser's toolbar.
  const tableRef = useRef<HTMLTableElement | null>(null);
  useEffect(() => {
    if (selectedYear == null) return;
    const row = tableRef.current?.querySelector<HTMLTableRowElement>("tr.is-selected");
    if (!row) return;
    const r = row.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selectedYear]);
  const colX = (i: number) => ((i + 0.5) / n) * 100; // column center, % from left
  // The rank column shows whenever the API sent a rank (counting stats). No percentile column: it
  // sat beside Rank as a second ordinal running the other way, and the cell popover has it.
  const showRank = stat.tableRows.some((r) => r.rank != null);
  // The crowd a rank is among: the player's position in position mode, otherwise the league.
  const rankNoun = mode === "position" ? positionNoun(player.pos) : "players";
  const rankAmong = mode === "position" ? rankNoun.charAt(0).toUpperCase() + rankNoun.slice(1) : "WNBA";
  const refNoun = scaleNoun(mode, player.pos);

  // A hollow dot on the chart (a small sample, or a full season with no reference) needs its
  // legend entry; most players have none.
  const anyNotCompared = bars.some((b) => b.kind === "small" || (b.kind === "full" && b.up == null));
  // Where a column's value label sits relative to its dot (see the column render below). Computed
  // here as well for the last column: a label to the RIGHT of the last dot reaches past the plot's
  // edge, which a phone's scroller clips — so the inner keeps a right margin in that one case.
  const sideFor = (b: (typeof bars)[number]): "above" | "below" | "right" => (b.up !== false ? "above" : b.hPct != null && 100 - b.hPct > 88 ? "right" : "below");
  const lastLabelRight = n > 0 && bars[n - 1].kind !== "missed" && sideFor(bars[n - 1]) === "right";

  const renderRow = (r: StatTableRow) => (
    <tr key={r.year} className={r.year === selectedYear ? "is-selected" : undefined}>
      <td>
        {r.year}
        {/* A missed season is a row of dashes on screen; say why for a screen reader, which
            doesn't see the heatmap's gap. (The page no longer carries a separate note.) */}
        {r.missed && <span className="sr-only">, {(r.reason || "did not play").toLowerCase()}</span>}
        {/* No visible small-sample marker: the row's "—" difference, the heatmap popover and the
            "Not charted: … (small sample)" line already say it. Kept for a screen reader, which
            hears the row without those. */}
        {r.smallSample && !r.missed && <span className="sr-only">, small sample</span>}
      </td>
      {/* The stat's own value is always the first column after the year — for a shooting % too,
          with its makes/attempts AFTER it (they explain the %, they don't lead it). */}
      <td className={r.missed ? "text-muted" : undefined}>{r.valFmt}</td>
      {stat.component && (
        <>
          <td className="text-muted">{r.missed || r.made == null ? "—" : r.made}</td>
          <td className="text-muted">{r.missed || r.att == null ? "—" : r.att}</td>
        </>
      )}
      <td className="text-muted">{r.gp ?? "—"}</td>
      <td className="text-muted">{r.min != null ? r.min.toFixed(1) : "—"}</td>
      {showRank && (
        <td>
          {r.rank != null && r.pool != null ? (
            // The place alone, so the column skims as one number per row; the pool ("of 187") is in
            // the tooltip — hover, tap or focus. "34th of 187" on every row right-aligned on the
            // pool and left the ranks ragged. The visually hidden copy keeps the pool in the cell's
            // own text for a screen reader moving through the table cell by cell, where a tooltip
            // description isn't reliably spoken.
            <>
              <InfoTip label={ordinal(r.rank)} tip={`of ${r.pool} ${rankNoun}`} />
              <span className="sr-only"> of {r.pool}</span>
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
      {/* Header: the stat picker IS the title — a <select> set in the heading face ("Blocks ▾"),
          the one-line description under it. Until 2026-09-23 this was an <h2> "Blocks", the
          description, and then a labelled "Stat" dropdown reading "Blocks" again 60px below: the same
          fact twice, plus a row. The real heading is visually hidden — it keeps the section in the
          outline / heading navigation and stays the focus target for the heatmap's "See … history"
          link (tabIndex=-1). The description stays: for the shooting %s it is the only always-visible
          explanation on the page (the column InfoTips need a hover / tap). */}
      <div>
        {/* A kicker names the section — without it a lone "Blocks ▾" had no context (user). Plain
            text for sighted readers; the hidden heading below carries the section's name for AT. */}
        <div className="card-kicker" style={{ marginBottom: "var(--space-1)" }}>
          Stat detail
        </div>
        <h2 id="drilldown-title" tabIndex={-1} className="sr-only">
          {stat.label}, year by year
        </h2>
        <LabeledSelect
          variant="title"
          ariaLabel="Stat"
          value={statKey}
          options={STATS.map((s) => ({ value: s.key, label: s.label }))}
          onChange={(v) => onStatChange(v as StatKey)}
        />
        {/* The description without its "Points — " lead-in: the title already says the name. */}
        <div className="text-muted" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--space-1)" }}>
          {statDescBody(desc)}
        </div>
      </div>

      {stat.summary && <CareerSummary summary={stat.summary} unit={stat.unit} unitShort={stat.unitShort} rankAmong={rankAmong} />}

      {/* No caption naming the reference here: the "Compare to" control above and the legend below
          both say it ("League avg"), and the sentence was a third copy. No note for position-years
          with no bucket either: those cells' popover says "No forward avg that season", the chart
          draws a neutral dot, the table a "—". */}

      {/* Legend for the chart. */}
      <div style={{ margin: "var(--space-5) 0 var(--space-3)" }}>
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
          {anyNotCompared && (
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span aria-hidden="true" className="legend-dot dd-hollow" />
              Not compared
            </span>
          )}
        </div>
      </div>

      {/* The plot is decorative for assistive tech: every number it draws is in the table below.
          Hover titles serve mouse users. Layout: a fixed y-axis column on the left, then the plot
          in a scroller — on a phone a long career (each season at least COL_MIN wide) scrolls
          sideways while the axis labels stay put; on desktop nothing scrolls. */}
      <div className="card dd-card" aria-hidden="true">
        {stat.chartFallback ? (
          <div className="text-muted" style={{ padding: "var(--space-12) var(--space-2)", textAlign: "center", fontSize: "var(--fs-sm)" }}>
            {stat.chartFallback}
          </div>
        ) : (
          <div className="dd-body">
            <div className="dd-axis">
              <div style={{ position: "relative", height: PLOT_H }}>
                {stat.axisTicks.map((t) => (
                  <span key={t.label + t.yPct} className="dd-tick" style={{ top: `${100 - t.yPct}%` }}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="dd-scroll">
              <div className={"dd-inner" + (lastLabelRight ? " dd-edge-label" : "")} style={{ minWidth: n * COL_MIN }}>
                <div style={{ position: "relative", height: PLOT_H }}>
                  {/* Gridlines */}
                  {stat.axisTicks.map((t) => (
                    <div key={t.label + t.yPct} style={{ position: "absolute", left: 0, right: 0, top: `${100 - t.yPct}%`, borderTop: "1px solid var(--color-divider)" }} />
                  ))}

                  {/* Vertical column dividers between seasons */}
                  {bars.map((_, i) =>
                    i > 0 ? (
                      <div
                        key={`vg-${i}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / n) * 100}%`, borderLeft: "1px solid var(--color-divider)", zIndex: 2 }}
                      />
                    ) : null,
                  )}

                  {/* One column per season on the timeline. A full season: the value dot and the
                      reference dot, joined by a connector (the gap = that season's deviation). A small
                      sample: a hollow dot with its value, nothing to compare to. A missed year: a
                      hatched column (the heatmap row and the table row show it as "—"). */}
                  {bars.map((b, i) => {
                    const colStyle = { position: "absolute" as const, left: `${colX(i)}%`, top: 0, height: "100%", width: `${100 / n}%`, transform: "translateX(-50%)", zIndex: 3 };
                    // .dd-col: the click target; .is-selected = a wash over the whole column (not resized
                    // dots); .dd-missed = a faint diagonal hatch, the chart's "no season" mark.
                    const colClass = "dd-col" + (b.year === selectedYear ? " is-selected" : "") + (b.kind === "missed" ? " dd-missed" : "");
                    const onClick = () => toggleYear(b.year);
                    if (b.kind === "missed") return <div key={b.year} className={colClass} title={`${b.year}: did not play`} style={colStyle} onClick={onClick} />;
                    if (b.hPct == null) return <div key={b.year} className={colClass} title={`${b.year}: no value`} style={colStyle} onClick={onClick} />;
                    const yVal = 100 - b.hPct;
                    const yBase = b.basePct != null ? 100 - b.basePct : null;
                    const dot = 10;
                    // The value is printed beside the player's dot, on the side AWAY from the reference
                    // dot (above when at/above it, below when under it) so it never sits on the
                    // connector, LABEL_GAP px from the dot's center (the dot's radius is 5, so ~7px of
                    // air — at 8 it read as cramped). A dot within ~25px of the plot's floor has no room
                    // below — the label would land on the year axis — so there it goes to the dot's right.
                    const labelSide = sideFor(b);
                    const notCompared = b.kind === "small" || b.up == null;
                    const title =
                      b.kind === "small" ? `${b.year}: ${b.valFmt} · small sample — not compared` : `${b.year}: ${b.valFmt} · ${refNoun} ${b.baseFmt ?? "—"}`;
                    return (
                      <div key={b.year} className={colClass} title={title} style={colStyle} onClick={onClick}>
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
                          className={notCompared ? "dd-hollow" : undefined}
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: `${yVal}%`,
                            width: dot,
                            height: dot,
                            borderRadius: "50%",
                            // Red above the reference, blue below. Not compared (a small sample, or a
                            // position-year with no bucket): a hollow ring — a value, but no verdict.
                            background: notCompared ? undefined : b.up ? "var(--hm-above)" : "var(--hm-below)",
                            transform: "translate(-50%, -50%)",
                          }}
                        />
                        <span
                          className="dd-value"
                          style={
                            labelSide === "above"
                              ? { left: "50%", top: `calc(${yVal}% - ${LABEL_GAP}px)`, transform: "translate(-50%, -100%)" }
                              : labelSide === "below"
                                ? { left: "50%", top: `calc(${yVal}% + ${LABEL_GAP}px)`, transform: "translate(-50%, 0)" }
                                : { left: `calc(50% + ${LABEL_GAP - 1}px)`, top: `${yVal}%`, transform: "translate(0, -50%)" }
                          }
                        >
                          {b.labelFmt}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* X-axis year labels */}
                <div style={{ display: "flex", marginTop: "var(--space-2)" }}>
                  {bars.map((b) => (
                    <div key={b.year} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                      <span className="text-muted" style={{ fontSize: "var(--fs-3xs)", fontWeight: b.year === selectedYear ? 700 : 400 }}>
                        '{b.yy}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Yearly table — one full-width table, zebra-striped. table-layout: fixed gives evenly
          distributed columns and makes the table fit its container at any width. Missed seasons
          show as "—" rows (the reason is in the season cell for screen readers). */}
      <div style={{ marginTop: "var(--space-6)" }}>
        <table ref={tableRef} className="table" aria-label="Season stats">
          <thead>
            <tr>
              {/* "Year", not "Season": at 46px the longer word overran its 40px phone column and
                  touched the next header. The cells are years, so nothing is lost. */}
              <th scope="col">Year</th>
              <th scope="col">{stat.short}</th>
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
              <th scope="col">
                <InfoTip label="GP" tip="Games played that season" />
              </th>
              <th scope="col">
                <InfoTip label="Min" tip="Minutes played per game" />
              </th>
              {showRank && (
                <th scope="col">
                  <InfoTip
                    label="Rank"
                    tip={`${mode === "position" ? `Rank among the qualified ${rankNoun}` : "League rank among the qualified players"} in this dataset that season (1st = best). How many there are changes by year — hover or tap a rank to see.`}
                  />
                </th>
              )}
              <th scope="col">
                {/* "Diff", as the popover's "Difference" row: "vs avg" (with its space) wrapped to two
                    lines in a phone column and lifted the whole header row. A shooting %'s cells drop
                    their " pp" for the same reason; the unit lives here instead. */}
                <InfoTip label="Diff" tip={`How far above or below the ${refNoun} that season${stat.pct ? ", in percentage points" : ""}`} />
              </th>
            </tr>
          </thead>
          <tbody>{stat.tableRows.map(renderRow)}</tbody>
        </table>
      </div>
    </section>
  );
}
