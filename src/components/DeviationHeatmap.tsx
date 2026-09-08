import { useMemo, useRef, useState } from "react";
import type { PlayerDetail } from "../data/api";
import { STATS } from "../data/stats";
import {
  buildHeatmapGrid,
  cellPercentile,
  firstName,
  ordinal,
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
  /** Go to one stat's year-by-year history — the reveal strip's link, or Enter on a focused cell. */
  onDrill: (statKey: StatKey) => void;
}

// Max saturation a cell reaches (% toward the hue, away from the base). Capped below 100% so
// the in-cell text (var(--color-text), flips with theme) keeps ≥4.5:1 on every cell in BOTH
// themes — a full-saturation gradient passes through a mid-luminance band neither dark nor
// white text can clear.
const MAX_INTENSITY = 75;

const POS_SINGULAR: Record<string, string> = { G: "guard", F: "forward", C: "center" };

/** Short noun for the scale key + the strip ("career avg" / "league avg" / "center avg"). */
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

type Coord = { r: number; c: number };

/**
 * The player's whole career as one season × stat grid, colored by how far each stat sits from a
 * **switchable reference** — their own career, their position peers, or the league (that year).
 * Warm above / cool below. Each cell shows only the value; the *detail* (gap, and the percentile
 * rank in the peer modes) is revealed on demand: hover, tap, or arrow-key onto a cell and it
 * appears in the strip under the grid, with a link to that stat's full history. Cells never
 * navigate — a tap reveals — so touch gets the same detail as a mouse. Enter on a focused cell
 * goes to the history (keyboard parity with the strip's link).
 *
 * Accessibility: a real ARIA grid with **roving tabindex** — one Tab stop reaches the grid, arrow
 * keys move a single focus around the cells. Each cell's accessible name already carries value +
 * gap + reference + rank, so the strip is deliberately NOT a live region (that would announce the
 * same line twice on every arrow press); its link is a real button reachable after the grid.
 */
export function DeviationHeatmap({
  player,
  league,
  positions,
  playerPosition,
  positionAvailable,
  mode,
  onModeChange,
  onDrill,
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
  const [active, setActive] = useState<Coord>({ r: 0, c: 0 });
  // What the strip shows: the last cell focused or tapped (sticky), overridden while the pointer
  // hovers another cell (transient — clears when it leaves the grid).
  const [revealed, setRevealed] = useState<Coord | null>(null);
  const [hovered, setHovered] = useState<Coord | null>(null);
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
      case "Enter":
      case " ": {
        // Focus already revealed this cell; Enter/Space goes to its stat's history. Intercepted so
        // the button's native click (which now means *reveal*) doesn't fire instead.
        e.preventDefault();
        onDrill(grid.rows[r][c].statKey);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    focusCell(r, c); // onFocus reveals + syncs `active`
  };

  const noun = scaleNoun(effMode, playerPosition);
  const refPhrase = referencePhrase(effMode, playerPosition);
  const pctWhere = effMode === "position" ? `among ${positionNoun(playerPosition)}` : "in the league";
  const anySmall = grid.rows.some((row) => row.some((cell) => cell.smallSample));

  const shownCoord = hovered ?? revealed;
  const shown = shownCoord ? grid.rows[shownCoord.r][shownCoord.c] : null;

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
            Each cell is {firstName(player.name)}'s stat that season vs. {refPhrase} — color shows how far above or below. Hover, tap, or arrow to a cell for its exact gap and a link to that stat's history.
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

      {/* Scroll wrapper: on a phone the 8 stat columns can't fit 320px, so the grid scrolls
          horizontally there (a data grid may — WCAG 1.4.10) instead of pushing the page. Scoped to
          mobile via CSS so desktop keeps overflow:visible and its header tooltips. The reveal strip
          sits OUTSIDE this wrapper so the scroll container can never clip it. */}
      <div className="hm-scroll">
      <div
        role="grid"
        aria-label={`${firstName(player.name)}'s seasons vs. ${refPhrase}`}
        className="heatmap"
        style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${nCols}, minmax(40px, 1fr))` }}
        onKeyDown={onGridKeyDown}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Header row: corner + stat column labels (short, full name in a tooltip). Headers only
            explain themselves — they don't select anything (a header that navigates is a surprise). */}
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
                pct={cellPercentile(cell, effMode, league, positions, playerPosition)}
                pctWhere={pctWhere}
                noun={noun}
                refPhrase={refPhrase}
                tabbable={active.r === r && active.c === c}
                setRef={(el) => cellRefs.current.set(`${r}-${c}`, el)}
                onFocus={() => {
                  setActive({ r, c });
                  setRevealed({ r, c });
                }}
                onHover={() => setHovered({ r, c })}
                onTap={() => setRevealed({ r, c })}
              />
            ))}
          </div>
        ))}
      </div>
      </div>

      {/* Reveal strip — the shown cell's full line + a link to its stat's history. Reserved height
          (CSS) so revealing never shifts the page. */}
      <div className="hm-reveal">
        {shown ? (
          <RevealLine
            cell={shown}
            noun={noun}
            pct={cellPercentile(shown, effMode, league, positions, playerPosition)}
            pctWhere={pctWhere}
            onDrill={() => onDrill(shown.statKey)}
          />
        ) : (
          <span className="text-muted">Hover, tap, or arrow to a cell for its details.</span>
        )}
      </div>

      {anySmall && (
        <div className="hm-legend-key text-muted" style={{ marginTop: "var(--space-3)" }}>
          <span className="hm-legend-dot" /> small sample (few games or attempts) — not compared
        </div>
      )}
    </section>
  );
}

interface RevealLineProps {
  cell: HeatmapCell;
  noun: string;
  pct: number | null;
  pctWhere: string;
  onDrill: () => void;
}

/** The strip's content for one cell: "2024 · Points  26.9 · +5.3 vs career avg · 94th percentile
    in the league" (each part only when it exists), plus the history link. */
function RevealLine({ cell, noun, pct, pctWhere, onDrill }: RevealLineProps) {
  const stat = statName(cell.statKey);
  return (
    <>
      <span>
        <b>{cell.year} · {stat}</b>
        {!cell.played ? (
          <span className="text-muted"> — did not play</span>
        ) : (
          <>
            {" "}
            <span style={{ fontWeight: 600 }}>{cell.valueFmt}</span>
            {cell.smallSample ? (
              <span className="text-muted"> — small sample, not compared</span>
            ) : cell.delta == null ? (
              <span className="text-muted"> · no {noun} that season</span>
            ) : (
              <>
                <span> · {cell.deltaFmt} vs {noun}</span>
                {pct != null && <span> · {ordinal(Math.round(pct))} percentile {pctWhere}</span>}
              </>
            )}
          </>
        )}
      </span>
      <button type="button" className="btn btn-ghost" style={{ paddingInline: 0 }} onClick={onDrill}>
        See {stat.toLowerCase()} history ↓
      </button>
    </>
  );
}

interface CellProps {
  cell: HeatmapCell;
  pct: number | null;
  pctWhere: string;
  noun: string;
  refPhrase: string;
  tabbable: boolean;
  setRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onHover: () => void;
  onTap: () => void;
}

function Cell({ cell, pct, pctWhere, noun, refPhrase, tabbable, setRef, onFocus, onHover, onTap }: CellProps) {
  // Background: diverging color for a scored cell; the neutral base for a played cell with no
  // reference; class-driven grey for small-sample; empty for a missed season.
  const bg =
    !cell.played || cell.smallSample
      ? undefined
      : cell.colorT == null
        ? "var(--hm-base)"
        : `color-mix(in srgb, ${cell.colorT >= 0 ? "var(--hm-above)" : "var(--hm-below)"} ${Math.abs(cell.colorT) * MAX_INTENSITY}%, var(--hm-base))`;

  const cls = "hm-cell" + (!cell.played ? " hm-empty" : "") + (cell.smallSample ? " hm-muted hm-ss" : "");

  // Accessible name: the full line (a grid doesn't auto-associate its headers like a table), the
  // same detail the strip shows — including the rank — so a screen-reader user gets everything on
  // the cell itself, then "Enter for … history" as the action.
  const stat = statName(cell.statKey);
  const detail = !cell.played
    ? `${stat} ${cell.year}: did not play`
    : cell.smallSample
      ? `${stat} ${cell.year}: ${cell.valueFmt}, small sample — not compared`
      : cell.delta == null
        ? `${stat} ${cell.year}: ${cell.valueFmt}, no ${noun} that season`
        : `${stat} ${cell.year}: ${cell.valueFmt}, ${cell.deltaFmt} vs ${refPhrase}` +
          (pct != null ? `, ${ordinal(Math.round(pct))} percentile ${pctWhere}` : "");

  return (
    <button
      ref={setRef}
      role="gridcell"
      type="button"
      className={cls}
      style={bg ? { background: bg, color: "var(--color-text)" } : undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${detail} — Enter for ${stat.toLowerCase()} history`}
      onFocus={onFocus}
      onMouseEnter={onHover}
      onClick={onTap}
    >
      {cell.played ? cell.valueFmt : "—"}
    </button>
  );
}

function statName(key: StatKey): string {
  return STATS.find((s) => s.key === key)?.label ?? key.toUpperCase();
}
