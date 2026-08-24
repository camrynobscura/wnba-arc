import type { PlayerDetail, PlayerSummary } from "../data/api";
import type { ComparisonTarget, StatDetail, StatTableRow } from "../lib/deviation";
import { InfoTip } from "./InfoTip";
import { PlayerSearch } from "./PlayerSearch";

interface StatDrilldownViewProps {
  player: PlayerDetail;
  stat: StatDetail;
  target: ComparisonTarget;
  /** Full roster + its load error, for the in-row "search more players" box. */
  players: PlayerSummary[] | null;
  listError: string | null;
  onTargetChange: (target: ComparisonTarget) => void;
  onBack: () => void;
  onSelectYear: (year: number) => void;
  onPick: (espn: string) => void;
}

const PLOT_H = 220; // px

export function StatDrilldownView({ player, stat, target, players, listError, onTargetChange, onBack, onSelectYear, onPick }: StatDrilldownViewProps) {
  const bars = stat.bars;
  const n = bars.length;
  const colX = (i: number) => ((i + 0.5) / n) * 100; // column center, % from left

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
          <span className="text-muted" style={{ fontSize: 10, marginLeft: 6 }}>
            small sample
          </span>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        {r.missed ? <span className="text-muted">DNP — {r.reason}</span> : r.valFmt}
      </td>
      <td style={{ textAlign: "right" }} className="text-muted">
        {r.gp ?? "—"}
      </td>
      <td style={{ textAlign: "right" }} className="text-muted">
        {r.min != null ? r.min.toFixed(1) : "—"}
      </td>
      <td style={{ textAlign: "right", color: r.missed ? undefined : r.deltaColor }}>
        {r.deltaFmt}
      </td>
    </tr>
    );
  };

  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "18px 20px 16px" }}>
      {/* Top row: back to this player's summary (left) + jump to another player (right). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <button className="btn btn-ghost" style={{ gap: 8 }} onClick={onBack}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{player.name}</span>
        </button>
        <PlayerSearch variant="compact" players={players} listError={listError} onPick={onPick} />
      </div>

      <div className="card-kicker" style={{ marginBottom: 4 }}>
        {player.name} · career history
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>{stat.label}</h1>
          {!stat.pct && (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
              per game
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "flex-end" }}>
            <span className="text-heading" style={{ fontSize: 28, lineHeight: 1 }}>
              {stat.curFmt}
            </span>
            <span className="text-heading" style={{ fontSize: 18, color: stat.deltaColor }}>
              {stat.rawFmt}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {stat.year} · baseline {stat.baseFmt}
          </div>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 13, margin: "8px 0 18px" }}>
        {stat.caption}
      </p>

      {/* Legend + baseline toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--hm-above)" }} />
            Above baseline
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--hm-below)" }} />
            Below baseline
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-neutral-600)" }} />
            Baseline
          </span>
        </div>
        <div role="radiogroup" aria-label="Compare against">
          <div className="seg">
            <label className="seg-opt">
              <input type="radio" name="drilltgt" checked={target === "own"} onChange={() => onTargetChange("own")} />
              <span>Their own</span>
            </label>
            <label className="seg-opt">
              <input type="radio" name="drilltgt" checked={target === "league"} onChange={() => onTargetChange("league")} />
              <span>League avg</span>
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "18px 18px 12px" }}>
        <div style={{ position: "relative", height: PLOT_H, paddingLeft: 4 }}>
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
                  fontSize: 10,
                  color: "var(--color-neutral-700)",
                  background: "var(--color-bg)",
                  paddingRight: 4,
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
                aria-label={`${b.year}: ${b.valFmt}${b.smallSample ? " (small sample)" : ""}${selectable ? " — compare this season" : " — too few games to compare"}`}
                title={selectable ? `Set ${b.year} as the compared season` : "Too few games to compare"}
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
                    // baseline, blue below (the baseline dot below stays neutral grey).
                    background: valueAbove ? "var(--hm-above)" : "var(--hm-below)",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                {/* value number for the selected season, offset off the dot for breathing room */}
                {sub && (
                  <span
                    className="text-heading"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: `${yVal}%`,
                      transform: valueAbove ? "translate(-50%, -50%) translateY(-18px)" : "translate(-50%, -50%) translateY(18px)",
                      fontSize: 12,
                      fontWeight: 700, // heavier than the utility's default for the on-chart value label
                      color: "var(--color-text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.valFmt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* X-axis year labels */}
        <div style={{ display: "flex", marginTop: 6 }}>
          {bars.map((b) => (
            <div key={b.year} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
              <span
                className="text-muted"
                title={b.missed ? b.reason : undefined}
                style={{ fontSize: 10, fontWeight: b.isSubject ? 700 : 400, opacity: b.missed ? 0.6 : 1 }}
              >
                '{b.yy}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: 14 }}>
        Each season shows two dots — the player's {stat.label.toLowerCase()} (red above the baseline, blue
        below) and grey = the baseline; the gap between them is that season's deviation. Tap a season to
        compare it. Gaps are missed seasons.
      </p>

      {/* Yearly table (F2) — one full-width table, zebra-striped. table-layout: fixed
          gives evenly-distributed columns and makes the table fit its container at any
          width (no horizontal scroll needed → nothing clips the header tooltips). */}
      <div style={{ marginTop: 22 }}>
        <table className="table" style={{ tableLayout: "fixed" }} aria-label="Season stats">
          <colgroup>
            <col style={{ width: "24%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Season</th>
              <th style={{ textAlign: "right" }}>{stat.short}</th>
              <th style={{ textAlign: "right" }}>
                <InfoTip label="GP" tip="Games played that season" />
              </th>
              <th style={{ textAlign: "right" }}>
                <InfoTip label="Min" tip="Minutes played per game" />
              </th>
              <th style={{ textAlign: "right" }}>
                <InfoTip label="vs base" tip="Difference from that season's baseline (the player's prior average, or the league)" />
              </th>
            </tr>
          </thead>
          <tbody>{stat.tableRows.map(renderRow)}</tbody>
        </table>
      </div>
    </main>
  );
}
