import { useEffect, useRef, useState } from "react";
import type { PlayerDetail } from "../data/api";
import { STATS, statDescBody } from "../data/stats";
import {
  lowerFirst,
  ordinal,
  positionNoun,
  referencePhrase,
  scaleNoun,
  upperFirst,
  type HeatmapMode,
  type StatDetail,
  type StatKey,
  type StatTableRow,
} from "../lib/deviation";
import { CareerSummary } from "./CareerSummary";
import { InfoTip } from "./InfoTip";
import { TitleSelect } from "./TitleSelect";

interface StatDrilldownViewProps {
  player: PlayerDetail;
  stat: StatDetail;
  /** Which stat is shown; drives the section's stat picker. */
  statKey: StatKey;
  /** The stat's one-line description (STATS[].desc), shown under its name without the lead-in. */
  desc: string;
  /** The page's reference mode, set in the sticky CompareBar, which stays in reach down here. */
  mode: HeatmapMode;
  onStatChange: (key: StatKey) => void;
}

const PLOT_H = 220; // px
const LABEL_GAP = 12; // px from a dot's center to its value label
// The narrowest a season column gets before the plot scrolls sideways (phones). A column is a click
// target (it highlights its table row), so 24px, WCAG 2.5.8's minimum. Nine columns fit a 320px phone.
const COL_MIN = 24; // px
// A dot in the bottom 12% of the plot (~26px of PLOT_H) has no room for its value label below it (it
// would land on the year axis), so the label goes to the dot's right instead.
const FLOOR_LABEL_ZONE = 12; // % of the plot's height

/**
 * One stat's history: the career at a glance (plates), a chart of each season's value against its
 * reference, and the yearly table. A section of the player page below the heatmap, not its own route.
 * The heading has tabIndex=-1 so the heatmap's "See … history" link (or Enter on a cell) can move
 * focus here.
 */
export function StatDrilldownView({ player, stat, statKey, desc, mode, onStatChange }: StatDrilldownViewProps) {
  const bars = stat.bars;
  const n = bars.length;
  // Clicking a chart column highlights that year's table row (and the column), so a reader can find one
  // season's numbers without counting rows. Not in the URL; a second click clears it, and it survives a
  // stat change. Pointer only, on purpose: the chart is hidden from screen readers and its columns aren't
  // focusable, and keyboard and screen-reader users read the table directly.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const toggleYear = (year: number) => setSelectedYear((cur) => (cur === year ? null : year));
  // Bring the highlighted row into view when it isn't (on a phone the table is a screen below the
  // chart). Centered: "nearest" would park it on the bottom edge, under a phone browser's toolbar.
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
  // The rank column shows when any season has a rank, or a compared season has a reason it has none. A
  // small-sample row's note doesn't add the column on its own.
  const showRank = stat.tableRows.some((r) => r.rank != null || r.unranked != null);
  // Year · value · GP · Min · [Rank] · Diff, for the equal-width <col>s.
  const colCount = 5 + (showRank ? 1 : 0);
  // The crowd a rank is among: the player's position in position mode, otherwise the league.
  const rankNoun = mode === "position" ? positionNoun(player.pos) : "players";
  const rankAmong = mode === "position" ? upperFirst(rankNoun) : "WNBA";
  const refNoun = scaleNoun(mode, player.pos);

  // A hollow dot on the chart (a small sample, or a full season with no reference) needs its
  // legend entry; most players have none.
  const anyNotCompared = bars.some((b) => b.kind === "small" || (b.kind === "full" && b.up == null));
  // Where a column's value label sits relative to its dot (see the column render below). Also needed
  // here for the last column: a label to the right of the last dot reaches past the plot's edge, which a
  // phone's scroller clips, so the plot keeps a right margin in that one case.
  const sideFor = (b: (typeof bars)[number]): "above" | "below" | "right" => (b.up !== false ? "above" : b.hPct != null && b.hPct < FLOOR_LABEL_ZONE ? "right" : "below");
  const lastLabelRight = n > 0 && bars[n - 1].kind !== "missed" && sideFor(bars[n - 1]) === "right";

  const renderRow = (r: StatTableRow) => (
    <tr key={r.year} className={r.year === selectedYear ? "is-selected" : undefined}>
      {/* The year is the row's header, so a screen reader moving down a column says which season each
          number belongs to ("2024, 1st of 123"). */}
      <th scope="row">
        {r.year}
        {/* A missed season is a row of dashes on screen; say why for a screen reader. */}
        {r.missed && <span className="sr-only">, {(r.reason || "did not play").toLowerCase()}</span>}
        {/* No visible small-sample marker on the year: the rank column's dash carries the note as a
            tooltip. Spoken here because the rank column isn't always shown. */}
        {r.note && !r.missed && <span className="sr-only">, {lowerFirst(r.note)}</span>}
        {r.partial && !r.missed && <span className="sr-only">, partial season</span>}
      </th>
      <td className={r.missed ? "text-muted" : undefined}>{r.valFmt}</td>
      <td className="text-muted">{r.gp ?? "—"}</td>
      <td className="text-muted">{r.min != null ? r.min.toFixed(1) : "—"}</td>
      {showRank && (
        <td>
          {/* The rank tooltips aren't Tab stops: one per season made the table most of the page's stops.
              Hover and tap still open them, a screen reader gets the text in the cell, and the keyboard
              reaches the same rank in the heatmap cell's popover. */}
          {r.rank != null && r.pool != null ? (
            // The place alone, so the column skims as one number per row; the pool is in the tooltip. The
            // hidden copy keeps the pool in the cell's own text for a screen reader moving cell by cell,
            // where a tooltip description isn't reliably spoken.
            <>
              <InfoTip label={ordinal(r.rank)} tip={`${ordinal(r.rank)} of ${r.pool} ${rankNoun}`} tabIndex={-1} />
              <span className="sr-only"> of {r.pool}</span>
            </>
          ) : r.unranked ? (
            // Compared but under the rank floor: the dash carries the reason the way a rank carries its
            // pool, and says it outright for a screen reader.
            <>
              <InfoTip label="—" name="Not ranked" tip={r.unranked} tabIndex={-1} />
              <span className="sr-only"> {r.unranked}</span>
            </>
          ) : r.note ? (
            // A small sample: the dash carries the note ("Small sample: 9 of 44 games"). The year cell
            // already spoke it.
            <InfoTip label="—" name="Not ranked" tip={r.note} tabIndex={-1} />
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
      className="dd-section"
      style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "2px solid var(--color-divider)" }}
    >
      {/* The stat picker is the title: a <select> in the heading face ("Blocks ▾"), with the description
          under it. The real heading is visually hidden; it keeps the section in the heading outline and
          is the focus target for the heatmap's "See … history" link. */}
      <div>
        <div className="kicker" style={{ marginBottom: "var(--space-1)" }}>
          Stat detail
        </div>
        <h2 id="drilldown-title" tabIndex={-1} className="sr-only">
          {stat.label}, year by year
        </h2>
        <TitleSelect
          ariaLabel="Stat"
          value={statKey}
          options={STATS.map((s) => ({ value: s.key, label: s.label }))}
          onChange={(v) => onStatChange(v as StatKey)}
        />
        {/* The description without its "Points — " lead-in; the title already says the name. */}
        <div className="text-muted" style={{ fontSize: "var(--fs-sm)", marginTop: "var(--space-1)" }}>
          {statDescBody(desc)}
        </div>
      </div>

      {stat.summary && <CareerSummary summary={stat.summary} unit={stat.unit} unitShort={stat.unitShort} rankAmong={rankAmong} />}

      {/* The chart's legend, hidden from screen readers along with the chart: the table has every number. */}
      <div aria-hidden="true" style={{ margin: "var(--space-5) 0 var(--space-3)" }}>
        <div className="dd-legend">
          <span className="dd-legend-item">
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--hm-above)" }} />
            Above {refNoun}
          </span>
          <span className="dd-legend-item">
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--hm-below)" }} />
            Below {refNoun}
          </span>
          <span className="dd-legend-item">
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--color-neutral-600)" }} />
            {upperFirst(refNoun)}
          </span>
          {anyNotCompared && (
            <span className="dd-legend-item">
              <span aria-hidden="true" className="legend-dot dd-hollow" />
              Not compared
            </span>
          )}
        </div>
      </div>

      {/* Hidden from screen readers: every number it draws is in the table below. A fixed y-axis column,
          then the plot in a scroller; on a phone a long career scrolls sideways under the axis labels. */}
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
            {/* Out of the Tab order: Chromium and Firefox make a scroller a Tab stop of its own, and this
                one is inside the hidden chart, so a screen reader said nothing there. */}
            <div className="dd-scroll" tabIndex={-1}>
              <div className={"dd-inner" + (lastLabelRight ? " dd-edge-label" : "")} style={{ minWidth: n * COL_MIN }}>
                <div style={{ position: "relative", height: PLOT_H }}>
                  {/* Gridlines */}
                  {stat.axisTicks.map((t) => (
                    <div key={t.label + t.yPct} style={{ position: "absolute", left: 0, right: 0, top: `${100 - t.yPct}%`, borderTop: "1px solid var(--color-divider)" }} />
                  ))}

                  {/* Column dividers between seasons */}
                  {bars.map((_, i) =>
                    i > 0 ? (
                      <div
                        key={`vg-${i}`}
                        style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / n) * 100}%`, borderLeft: "1px solid var(--color-divider)", zIndex: 2 }}
                      />
                    ) : null,
                  )}

                  {/* One column per season. A full season: the value dot and the reference dot, joined
                      by a connector. A small sample: a hollow dot with its value. A missed year: a
                      hatched column. */}
                  {bars.map((b, i) => {
                    const colStyle = { position: "absolute" as const, left: `${colX(i)}%`, top: 0, height: "100%", width: `${100 / n}%`, transform: "translateX(-50%)", zIndex: 3 };
                    const colClass = "dd-col" + (b.year === selectedYear ? " is-selected" : "") + (b.kind === "missed" ? " dd-missed" : "");
                    const onClick = () => toggleYear(b.year);
                    if (b.kind === "missed") return <div key={b.year} className={colClass} title={`${b.year}: did not play`} style={colStyle} onClick={onClick} />;
                    if (b.hPct == null) return <div key={b.year} className={colClass} title={`${b.year}: no value`} style={colStyle} onClick={onClick} />;
                    const yVal = 100 - b.hPct;
                    const yBase = b.basePct != null ? 100 - b.basePct : null;
                    const dot = 10;
                    // The value sits beside the player's dot on the side away from the reference dot, so
                    // it never sits on the connector. A dot within FLOOR_LABEL_ZONE of the floor has no
                    // room below, so its label goes to the right.
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
                            className="dd-dot"
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
                          className={notCompared ? "dd-hollow" : "dd-dot"}
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: `${yVal}%`,
                            width: dot,
                            height: dot,
                            borderRadius: "50%",
                            // Red above the reference, blue below. Not compared (a small sample, or a
                            // position-year with no group): a hollow ring, a value with no verdict.
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

      {/* The yearly table: equal columns while they fit. A column never shrinks below its widest cell, so
          when they can't fit, the table scrolls sideways instead of text running into the next column. */}
      <div className="table-scroll" style={{ marginTop: "var(--space-6)" }}>
        {/* Named by the section's hidden heading ("Points, year by year"), so a screen reader hears which
            stat the table holds. Not a <caption>: WebKit repaints the header rule lighter under every
            column but the first when a table has a visually hidden caption. */}
        <table ref={tableRef} className="table" aria-labelledby="drilldown-title">
          <colgroup>
            {Array.from({ length: colCount }, (_, i) => (
              <col key={i} style={{ width: `${100 / colCount}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {/* "Year", not "Season": the longer word overran its 40px phone column. */}
              <th scope="col">Year</th>
              {/* The heatmap header's tooltip, word for word (STATS[].desc). */}
              <th scope="col">
                <InfoTip label={stat.short} tip={desc} />
              </th>
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
                    tip={`Rank among ${mode === "position" ? rankNoun : "all players"} ${stat.pct ? "with enough games and shots" : "who played enough games"} that season (1st = best)`}
                  />
                </th>
              )}
              <th scope="col">
                {/* "Diff": "vs avg" wrapped to two lines in a phone column. A shooting %'s cells drop their
                    " pp" for the same reason, so the unit is in this tooltip. */}
                <InfoTip label="Diff" tip={`How far above or below ${referencePhrase(mode, player.pos)} that season${stat.pct ? ", in percentage points" : ""}`} />
              </th>
            </tr>
          </thead>
          <tbody>{stat.tableRows.map(renderRow)}</tbody>
        </table>
      </div>
    </section>
  );
}
