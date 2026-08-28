import { useMemo, useRef, useState } from "react";
import type { PlayerDetail } from "../data/api";
import { STATS } from "../data/stats";
import {
  buildHeatmapGrid,
  firstName,
  playedSeasons,
  positionNoun,
  type HeatmapCell,
  type HeatmapMode,
  type League,
  type PositionLookup,
  type StatKey,
} from "../lib/deviation";
import { InfoTip } from "./InfoTip";
import { ScaleKey } from "./ScaleKey";
import { LabeledSelect } from "./Select";

interface DeviationHeatmapProps {
  player: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
  playerPosition: string | null;
  /** Whether "vs their position" can be offered (position known AND /positions loaded). */
  positionAvailable: boolean;
  mode: HeatmapMode;
  onModeChange: (m: HeatmapMode) => void;
  /** Open the year-by-year drill-down for one season × stat (a selectable cell). */
  onOpenCell: (year: number, statKey: StatKey) => void;
}

// Max saturation a cell reaches (% toward the hue, away from the base). Capped below 100% so
// the in-cell text (var(--color-text), flips with theme) keeps ≥4.5:1 on every cell in BOTH
// themes — a full-saturation gradient passes through a mid-luminance band neither dark nor
// white text can clear. (Same rationale + value as the previous CareerHeatmap.)
const MAX_INTENSITY = 75;

const POS_SINGULAR: Record<string, string> = { G: "guard", F: "forward", C: "center" };

/** Short noun for the scale key + cell delta, per mode ("career avg" / "league avg" / "center avg"). */
function scaleNoun(mode: HeatmapMode, pos: string | null): string {
  if (mode === "self") return "career avg";
  if (mode === "league") return "league avg";
  return `${POS_SINGULAR[pos ?? ""] ?? "position"} avg`;
}

/** Spoken phrase for a cell's accessible name ("their career average", "the league average", …). */
function referencePhrase(mode: HeatmapMode, pos: string | null): string {
  if (mode === "self") return "their career average";
  if (mode === "league") return "the league average";
  return `the ${POS_SINGULAR[pos ?? ""] ?? "position"} average`;
}

/**
 * The player's whole career as one season × stat grid, colored by how far each stat sits from a
 * **switchable reference** — their own career, their position peers, or the league (that year).
 * Warm above / cool below; the number in each cell is the +/− gap. Every cell is a button: click
 * (or Enter) opens that season's year-by-year drill-down for that stat.
 *
 * Accessibility: a real ARIA grid with **roving tabindex** — one Tab stop reaches the grid, then
 * arrow keys move a single focus around the cells and Enter opens the drill-down. This replaces
 * the earlier aria-hidden treatment (right for a non-interactive visual, wrong now that the grid
 * is the page's primary interactive surface): a screen-reader user can navigate it and hear each
 * cell's value + gap + reference, then drill in.
 */
export function DeviationHeatmap({
  player,
  league,
  positions,
  playerPosition,
  positionAvailable,
  mode,
  onModeChange,
  onOpenCell,
}: DeviationHeatmapProps) {
  // Self mode needs ≥2 seasons to be meaningful (one season vs. itself is all-neutral); a
  // one-season player is offered only the peer modes, and a stray self mode degrades to league.
  const canSelf = playedSeasons(player).length >= 2;
  const effMode: HeatmapMode = mode === "self" && !canSelf ? "league" : mode;

  const grid = useMemo(
    () => buildHeatmapGrid(player, effMode, league, positions, playerPosition),
    [player, effMode, league, positions, playerPosition],
  );

  // Roving tabindex: `active` is the focused cell; only it is tabbable. Refs let arrow keys move
  // real DOM focus. Start on the first cell (top-left = newest season, first stat).
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const cellRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const nRows = grid.years.length;
  const nCols = STATS.length;

  const focusCell = (r: number, c: number) => cellRefs.current.get(`${r}-${c}`)?.focus();

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    let { r, c } = active;
    switch (e.key) {
      case "ArrowRight": c = Math.min(c + 1, nCols - 1); break;
      case "ArrowLeft": c = Math.max(c - 1, 0); break;
      case "ArrowDown": r = Math.min(r + 1, nRows - 1); break;
      case "ArrowUp": r = Math.max(r - 1, 0); break;
      case "Home": c = 0; break;
      case "End": c = nCols - 1; break;
      default: return;
    }
    e.preventDefault();
    focusCell(r, c); // onFocus will sync `active`
  };

  const noun = scaleNoun(effMode, playerPosition);
  const refPhrase = referencePhrase(effMode, playerPosition);
  const anySmall = grid.rows.some((row) => row.some((cell) => cell.smallSample));

  const modeOptions = [
    ...(canSelf ? [{ value: "self", label: "their career" }] : []),
    { value: "league", label: "the league" },
    ...(positionAvailable ? [{ value: "position", label: `other ${positionNoun(playerPosition)}` }] : []),
  ];

  return (
    <section aria-labelledby="heatmap-title" style={{ margin: "var(--space-1) 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div>
          <h2 id="heatmap-title" style={{ fontSize: "var(--fs-xl)", margin: 0 }}>Season by season</h2>
          <div className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-2)" }}>
            Each cell is {firstName(player.name)}'s stat that season vs. {refPhrase} — color shows how far above or below, the number is the gap. Pick any cell for its year-by-year history.
          </div>
        </div>
        <LabeledSelect
          label="Compare to"
          value={effMode}
          options={modeOptions}
          onChange={(v) => onModeChange(v as HeatmapMode)}
        />
      </div>

      {/* Diverging color key, adapting its end labels to the current reference. */}
      <div className="scale-legend" style={{ marginBottom: "var(--space-4)" }}>
        <ScaleKey noun={noun} />
      </div>

      <div
        role="grid"
        aria-label={`${firstName(player.name)}'s seasons vs. ${refPhrase}`}
        className="heatmap"
        style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${nCols}, minmax(44px, 1fr))` }}
        onKeyDown={onGridKeyDown}
      >
        {/* Header row: corner + stat column labels (short, full name in a tooltip). */}
        <div role="row" style={{ display: "contents" }}>
          {/* Corner over the year column — sr-only text (not aria-label) so it isn't an empty
              header (axe empty-table-header wants real content); "Season" won't fit visibly. */}
          <div role="columnheader" className="hm-colhead"><span className="sr-only">Season</span></div>
          {STATS.map((st) => (
            <div role="columnheader" key={`h-${st.key}`} className="hm-colhead">
              <InfoTip label={st.short} tip={st.desc} />
            </div>
          ))}
        </div>

        {grid.rows.map((row, r) => (
          <div role="row" style={{ display: "contents" }} key={grid.years[r]}>
            <div role="rowheader" className="hm-rowhead">
              <span className="hm-year-full">{grid.years[r]}</span>
              <span className="hm-year-short">{`'${String(grid.years[r]).slice(2)}`}</span>
            </div>
            {row.map((cell, c) => (
              <Cell
                key={`${cell.year}-${cell.statKey}`}
                cell={cell}
                noun={noun}
                refPhrase={refPhrase}
                tabbable={active.r === r && active.c === c}
                setRef={(el) => cellRefs.current.set(`${r}-${c}`, el)}
                onFocus={() => setActive({ r, c })}
                onOpen={() => onOpenCell(cell.year, cell.statKey)}
              />
            ))}
          </div>
        ))}
      </div>

      {anySmall && (
        <div className="hm-legend-key text-muted" style={{ marginTop: "var(--space-3)" }}>
          <span className="hm-legend-dot" /> small sample (few games or attempts) — not compared
        </div>
      )}
    </section>
  );
}

interface CellProps {
  cell: HeatmapCell;
  noun: string;
  refPhrase: string;
  tabbable: boolean;
  setRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onOpen: () => void;
}

function Cell({ cell, noun, refPhrase, tabbable, setRef, onFocus, onOpen }: CellProps) {
  // Background: diverging color for a scored cell; the neutral base for a played cell with no
  // reference; class-driven grey for small-sample; empty for a missed season.
  const bg =
    !cell.played || cell.smallSample
      ? undefined
      : cell.colorT == null
        ? "var(--hm-base)"
        : `color-mix(in srgb, ${cell.colorT >= 0 ? "var(--hm-above)" : "var(--hm-below)"} ${Math.abs(cell.colorT) * MAX_INTENSITY}%, var(--hm-base))`;

  const cls =
    "hm-cell" +
    (!cell.played ? " hm-empty" : "") +
    (cell.smallSample ? " hm-muted hm-ss" : "");

  // Visible delta: drop the " pp" suffix so it fits a narrow cell (aria keeps the full form).
  const deltaVis = cell.delta != null ? cell.deltaFmt.replace(" pp", "") : null;

  // Accessible name: full context, since a grid doesn't auto-associate its headers like a table.
  const label = !cell.played
    ? `${cell.statKey.toUpperCase()} ${cell.year}: did not play`
    : cell.smallSample
      ? `${statName(cell.statKey)} ${cell.year}: ${cell.valueFmt}, small sample — not compared`
      : cell.delta == null
        ? `${statName(cell.statKey)} ${cell.year}: ${cell.valueFmt}, no ${noun} that season — open year-by-year history`
        : `${statName(cell.statKey)} ${cell.year}: ${cell.valueFmt}, ${cell.deltaFmt} vs ${refPhrase} — open year-by-year history`;

  return (
    <button
      ref={setRef}
      role="gridcell"
      type="button"
      className={cls + (cell.selectable ? " hm-cell-btn" : "")}
      style={bg ? { background: bg, color: "var(--color-text)" } : undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-disabled={cell.selectable ? undefined : true}
      aria-label={label}
      onFocus={onFocus}
      onClick={cell.selectable ? onOpen : undefined}
    >
      {cell.played ? (
        <span className="hm-cell-body">
          <span className="hm-val">{cell.valueFmt}</span>
          {deltaVis && <span className="hm-delta">{deltaVis}</span>}
        </span>
      ) : (
        "—"
      )}
    </button>
  );
}

function statName(key: StatKey): string {
  return STATS.find((s) => s.key === key)?.label ?? key.toUpperCase();
}
