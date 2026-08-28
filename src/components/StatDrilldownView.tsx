import type { PlayerDetail, PlayerSummary } from "../data/api";
import { firstName, positionNoun, type ComparisonTarget, type StatDetail, type StatTableRow } from "../lib/deviation";
import { InfoTip } from "./InfoTip";
import { PlayerSearch } from "./PlayerSearch";
import { LabeledSelect } from "./Select";

interface StatDrilldownViewProps {
  player: PlayerDetail;
  stat: StatDetail;
  target: ComparisonTarget;
  /** Whether the same-position baseline is offered (position known + /positions loaded). */
  positionAvailable: boolean;
  /** Full roster + its load error, for the in-row "search more players" box. */
  players: PlayerSummary[] | null;
  listError: string | null;
  onTargetChange: (target: ComparisonTarget) => void;
  onBack: () => void;
  onSelectYear: (year: number) => void;
  onPick: (espn: string) => void;
}

const PLOT_H = 220; // px

/** 1 → "1st", 2 → "2nd", 94 → "94th" — for the drill-down's percentile line. */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "2021" · "2019 & 2021" · "2018, 2019 & 2021" — the missed-season notice's year list. */
function joinYears(years: number[]): string {
  if (years.length <= 1) return years.join("");
  return `${years.slice(0, -1).join(", ")} & ${years[years.length - 1]}`;
}

export function StatDrilldownView({ player, stat, target, positionAvailable, players, listError, onTargetChange, onBack, onSelectYear, onPick }: StatDrilldownViewProps) {
  const bars = stat.bars;
  const n = bars.length;
  const colX = (i: number) => ((i + 0.5) / n) * 100; // column center, % from left
  // Whether any table row is a small sample → show the dot key below the table. Wording is
  // stat-aware: a shooting % can be thin on games OR attempts; a counting stat only on games.
  const anySmallRow = stat.tableRows.some((r) => r.smallSample && !r.missed);
  const smallSampleKey = stat.component ? "small sample (few games or attempts)" : "small sample (few games)";
  // The percentile ("Pct") column shows only for counting stats with ladders — shooting %s and
  // pre-004 data have no percentile, so it's hidden then. It ranks the season "in the league" or
  // "among {position}", matching the current Compare-against target.
  const showPct = stat.tableRows.some((r) => r.pctile != null);
  const pctWhere = target === "position" ? `among ${positionNoun(player.pos)}` : "in the league";
  // Missed seasons (a gap in the timeline — "Did not play") get one plain-language note above the
  // table instead of a "DNP" tag wrapping every row to two lines. Years listed oldest-first.
  const missedYears = stat.tableRows.filter((r) => r.missed).map((r) => r.year).sort((a, b) => a - b);

  const renderRow = (r: StatTableRow) => {
    // Small-sample seasons aren't selectable (unless it's the fallback where a player has no
    // full season — then r.selectable is true). Missed seasons are never clickable.
    const clickable = !r.missed && r.selectable;
    return (
    <tr
      key={r.year}
      // Whole-row click is a mouse convenience; keyboard/SR use the year <button>.
      onClick={clickable ? () => onSelectYear(r.year) : undefined}
      style={{
        cursor: clickable ? "pointer" : "default",
        // Selected year: light-blue fill (overrides zebra stripe + hover). Others fall
        // through to the CSS zebra striping in theme.css.
        background: r.isSubject ? "color-mix(in srgb, var(--color-accent) 15%, transparent)" : undefined,
      }}
    >
      <td style={{ fontWeight: r.isSubject ? 700 : 400 }}>
        {clickable ? (
          <button
            className="btn-reset"
            onClick={() => onSelectYear(r.year)}
            aria-label={`${r.year} — compare this season`}
          >
            {r.year}
          </button>
        ) : (
          r.year
        )}
        {r.smallSample && !r.missed && (
          // Just a dot (keyed below the table) — the repeated "small sample" text wrapped the
          // year to two lines. role/aria-label keep it meaningful without visible text.
          <span className="hm-legend-dot" role="img" aria-label="small sample" style={{ marginLeft: "var(--space-2)" }} />
        )}
      </td>
      {stat.component && (
        <>
          <td className="text-muted">
            {r.missed || r.made == null ? "—" : r.made}
          </td>
          <td className="text-muted">
            {r.missed || r.att == null ? "—" : r.att}
          </td>
        </>
      )}
      <td className={r.missed ? "text-muted" : undefined}>
        {r.valFmt}
      </td>
      <td className="text-muted">
        {r.gp ?? "—"}
      </td>
      <td className="text-muted">
        {r.min != null ? r.min.toFixed(1) : "—"}
      </td>
      {showPct && (
        <td>
          {r.pctile != null ? ordinal(Math.round(r.pctile)) : <span className="text-muted">—</span>}
        </td>
      )}
      <td style={{ color: r.missed ? undefined : r.deltaColor }}>
        {r.deltaFmt}
      </td>
    </tr>
    );
  };

  return (
    <main id="main" className="view-main">
      {/* Top row: back to this player's summary (left) + jump to another player (right). */}
      <div className="view-header">
        <button className="btn btn-ghost" style={{ gap: "var(--space-2)" }} onClick={onBack}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{player.name}</span>
        </button>
        <PlayerSearch variant="compact" players={players} listError={listError} onPick={onPick} />
      </div>

      <div className="card-kicker" style={{ marginBottom: "var(--space-1)" }}>
        {player.name} · career history
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--fs-2xl)" }}>{stat.label}</h1>
          {/* Every stat gets a unit subtitle so the header height is consistent: counting
              stats are per-game averages; shooting %s are whole-season rates. */}
          <div className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-1)" }}>
            {stat.pct ? "season rate" : "per game"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <span
              className="text-heading"
              style={{ fontSize: "var(--fs-2xl)", lineHeight: 1, color: stat.subjectSmallSample ? "var(--color-neutral-500)" : undefined }}
            >
              {stat.curFmt}
            </span>
            {stat.subjectSmallSample ? (
              <span className="text-muted" style={{ fontSize: "var(--fs-sm)" }}>small sample</span>
            ) : (
              <span className="text-heading" style={{ fontSize: "var(--fs-lg)", color: stat.deltaColor }}>
                {stat.rawFmt}
              </span>
            )}
          </div>
          <div className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-1)" }}>
            {stat.year} · baseline {stat.baseFmt}
          </div>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: "var(--fs-sm)", margin: stat.positionNote ? "8px 0 8px" : "8px 0 18px" }}>
        {stat.caption}
      </p>
      {stat.positionNote && (
        <div role="note" className="note-card" style={{ margin: "0 0 var(--space-5)" }}>
          {stat.positionNote}
        </div>
      )}

      {/* Legend + baseline toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-4)", fontSize: "var(--fs-xs)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--hm-above)" }} />
            Above baseline
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--hm-below)" }} />
            Below baseline
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span aria-hidden="true" className="legend-dot" style={{ background: "var(--color-neutral-600)" }} />
            Baseline
          </span>
        </div>
        <LabeledSelect
          ariaLabel="Compare against"
          value={target}
          options={[
            { value: "league", label: "League avg" },
            ...(positionAvailable ? [{ value: "position", label: `Other ${positionNoun(player.pos)}` }] : []),
          ]}
          onChange={(v) => onTargetChange(v as ComparisonTarget)}
        />
      </div>

      <div className="card" style={{ padding: "var(--space-5) var(--space-5) var(--space-3)" }}>
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
              aria-hidden="true"
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

          {/* Vertical column dividers between seasons */}
          {bars.map((_, i) =>
            i > 0 ? (
              <div
                key={`vg-${i}`}
                aria-hidden="true"
                style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / n) * 100}%`, borderLeft: "1px solid var(--color-divider)" }}
              />
            ) : null,
          )}

          {/* One column per season: the value dot and the baseline dot, joined by a
              vertical connector (the gap = that season's deviation). The whole column is
              the click/keyboard target. Dots are decorative; the table carries the data. */}
          {bars.map((b, i) => {
            if (b.hPct == null) return null;
            const yVal = 100 - b.hPct;
            const yBase = b.basePct != null ? 100 - b.basePct : null;
            const sub = b.isSubject;
            const dot = 10;
            // Value dot is above the baseline dot (higher stat) → label on top; otherwise
            // the value is the lower dot → label below, so it never lands on the dots/line.
            const valueAbove = yBase == null || yVal <= yBase;
            // Small-sample seasons can't be made the subject (unless the fallback keeps them
            // selectable); render the column but disable selecting it.
            const selectable = b.selectable !== false;
            return (
              <button
                key={b.year}
                onClick={selectable ? () => onSelectYear(b.year) : undefined}
                disabled={!selectable}
                aria-label={`${b.year}: ${b.valFmt}, baseline ${b.baseFmt ?? "—"} — compare this season`}
                title={`${b.year}: ${b.valFmt} · baseline ${b.baseFmt ?? "—"}`}
                style={{
                  position: "absolute",
                  left: `${colX(i)}%`,
                  top: 0,
                  height: "100%",
                  width: `${100 / n}%`,
                  transform: "translateX(-50%)",
                  appearance: "none",
                  // Selection = highlight the whole column, not resized dots.
                  background: sub ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
                  borderRadius: 4,
                  border: 0,
                  padding: 0,
                  cursor: selectable ? "pointer" : "default",
                  zIndex: 3,
                }}
              >
                {/* connector */}
                {yBase != null && (
                  <span
                    aria-hidden="true"
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
                {/* baseline dot (grey — the secondary series) */}
                {yBase != null && (
                  <span
                    aria-hidden="true"
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
                {/* value dot (the actual stat) */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: `${yVal}%`,
                    width: dot,
                    height: dot,
                    borderRadius: "50%",
                    // Colored by direction like the rest of the app: red above the season's
                    // baseline, blue below. A season with NO baseline (a first real season, no
                    // prior history) is neutral grey — it can't be above or below a baseline that
                    // doesn't exist yet. (Small-sample seasons never reach the chart at all.)
                    background: yBase == null ? "var(--color-neutral-500)" : valueAbove ? "var(--hm-above)" : "var(--hm-below)",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                {/* value number for the selected season, offset off the dot for breathing room */}
                {sub && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: `${yVal}%`,
                      // Anchor by the label's NEAR edge (not its center) so the gap to the dot is
                      // the same for both labels regardless of height (the baseline label is 2 rows).
                      transform: valueAbove
                        ? "translate(-50%, -100%) translateY(-12px)"
                        : "translate(-50%, 0) translateY(12px)",
                      fontSize: "var(--fs-xs)",
                      fontWeight: 700, // bold for emphasis; body font (no text-heading) to match the baseline label
                      color: "var(--color-text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.valFmt}
                  </span>
                )}
                {/* baseline number for the selected season — offset opposite the value label
                    (the baseline dot is on the other side of the value) so they never overlap. */}
                {sub && yBase != null && b.baseFmt && (
                  <span
                    className="text-muted"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: `${yBase}%`,
                      // Near-edge anchored (see the value label) so both labels sit the same
                      // distance from their dot, whichever is on top.
                      transform: valueAbove
                        ? "translate(-50%, 0) translateY(12px)"
                        : "translate(-50%, -100%) translateY(-12px)",
                      fontSize: "var(--fs-2xs)",
                      // Stacked ("base" over the value) so the label stays within the narrow
                      // column instead of spilling past its edges.
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      lineHeight: 1.15,
                    }}
                  >
                    <span>base</span>
                    <span>{b.baseFmt}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* X-axis year labels */}
        <div style={{ display: "flex", marginTop: "var(--space-2)" }}>
          {bars.map((b) => (
            <div key={b.year} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
              <span
                className="text-muted"
                title={b.missed ? b.reason : undefined}
                style={{ fontSize: "var(--fs-3xs)", fontWeight: b.isSubject ? 700 : 400, opacity: b.missed ? 0.6 : 1 }}
              >
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
          Each season shows two dots — {firstName(player.name)}'s {stat.label.toLowerCase()} (red above the baseline, blue
          below) and grey = the baseline; the gap between them is that season's deviation. The selected season is labeled
          with both values (hover any season to read its numbers). Tap a season to compare it. Low-sample seasons are left
          off the chart — the table below has the full history.
        </p>
      )}

      {/* Yearly table (F2) — one full-width table, zebra-striped. table-layout: fixed
          gives evenly-distributed columns and makes the table fit its container at any
          width (no horizontal scroll needed → nothing clips the header tooltips). */}
      <div style={{ marginTop: "var(--space-6)" }}>
        {missedYears.length > 0 && (
          <div role="note" className="note-card" style={{ margin: "0 0 var(--space-3)" }}>
            <div>
              <strong style={{ fontWeight: 600 }}>
                No {joinYears(missedYears)} season{missedYears.length > 1 ? "s" : ""} on record
              </strong>{" "}
              — did not play.
            </div>
          </div>
        )}
        {/* table-layout: fixed + no per-column widths ⇒ every column is an equal share of the
            100%-wide table (5, 6, or 7 columns depending on the stat). */}
        <table className="table" aria-label="Season stats">
          <thead>
            <tr>
              <th scope="col">Season</th>
              {/* Makes/attempts for a rate stat, right before the % they produce — so a thin
                  season (e.g. 3PM 1 / 3PA 1 = 100%) explains its own "small sample" tag. */}
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
              <th scope="col">
                <InfoTip label="vs base" tip="Difference from that season's baseline (the league or same-position average that year)" />
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
    </main>
  );
}
