import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  /** Go to one stat's year-by-year history — the popover's link, or Enter on a focused cell. */
  onDrill: (statKey: StatKey) => void;
}

// Max saturation a cell reaches (% toward the hue, away from the base). Capped below 100% so
// the in-cell text (var(--color-text), flips with theme) keeps ≥4.5:1 on every cell in BOTH
// themes — a full-saturation gradient passes through a mid-luminance band neither dark nor
// white text can clear.
const MAX_INTENSITY = 75;

const POS_SINGULAR: Record<string, string> = { G: "guard", F: "forward", C: "center" };

/** Short noun for the scale key + the popover ("career avg" / "league avg" / "center avg"). */
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
const sameCoord = (a: Coord | null, b: Coord | null) => a != null && b != null && a.r === b.r && a.c === b.c;

const POPOVER_ID = "hm-popover";

/**
 * The player's whole career as one season × stat grid, colored by how far each stat sits from a
 * **switchable reference** — their own career, their position peers, or the league (that year).
 * Warm above / cool below. Each cell shows only the value; the *detail* (gap, and the percentile
 * rank in the peer modes) lives in a **popover anchored to the cell**: hover previews it, tap or
 * click pins it, arrow-key focus opens it, Esc / click-outside closes it. It carries a link to
 * that stat's full history. Cells never navigate — so a tap on a phone gets the same detail as a
 * mouse, right where the finger is (not in a strip that may be a screen below on a long career).
 *
 * Accessibility: a real ARIA grid with **roving tabindex** — one Tab stop reaches the grid, arrow
 * keys move a single focus around the cells. Each cell's accessible name carries value + gap +
 * reference + rank (so nothing is pointer-only) and Enter drills directly; the open cell is marked
 * aria-expanded and the popover — rendered in DOM order right after the grid, so Tab reaches its
 * link — is positioned `fixed` from the cell's rect, which also lifts it out of the mobile
 * horizontal-scroll container that would otherwise clip it.
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
  // real DOM focus and let the popover anchor to a cell's on-screen rect.
  const [active, setActive] = useState<Coord>({ r: 0, c: 0 });
  // Popover state: `pinned` = tapped/clicked (or keyboard-focused) — stays until dismissed;
  // `hovered` = pointer preview — transient. Open = pinned, else hovered.
  const [pinned, setPinned] = useState<Coord | null>(null);
  const [hovered, setHovered] = useState<Coord | null>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const overPopover = useRef(false);
  // A mouse click fires `focus` (which pins) BEFORE `click`, so a plain toggle in `click` would
  // undo the pin every time. `pointerdown` runs before both and records whether this cell was
  // already pinned; `click` then decides pin-vs-close from that.
  const pressWasPinned = useRef(false);
  // Esc returns focus to the cell; that programmatic focus must not re-open the popover.
  const suppressFocusOpen = useRef(false);
  const nRows = grid.years.length;
  const nCols = STATS.length;

  const openCoord = pinned ?? hovered;
  const openCell = openCoord ? grid.rows[openCoord.r][openCoord.c] : null;

  // A different player / reference resets everything (the grid's contents changed under it).
  useEffect(() => {
    setPinned(null);
    setHovered(null);
    setActive({ r: 0, c: 0 });
  }, [player, effMode]);

  const focusCell = (r: number, c: number) => cellRefs.current.get(`${r}-${c}`)?.focus();
  const close = () => {
    setPinned(null);
    setHovered(null);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    let { r, c } = active;
    switch (e.key) {
      case "ArrowRight": c = Math.min(c + 1, nCols - 1); break;
      case "ArrowLeft": c = Math.max(c - 1, 0); break;
      case "ArrowDown": r = Math.min(r + 1, nRows - 1); break;
      case "ArrowUp": r = Math.max(r - 1, 0); break;
      case "Home": c = 0; break;
      case "End": c = nCols - 1; break;
      case "Escape":
        close();
        return;
      case "Enter": {
        // Enter goes straight to the stat's history. Intercepted so the button's native click
        // (which now means *pin the popover*) doesn't fire instead.
        e.preventDefault();
        onDrill(grid.rows[r][c].statKey);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    focusCell(r, c); // onFocus opens the popover on the new cell + syncs `active`
  };

  // Dismiss on a click/tap outside the grid + popover, and on Esc anywhere (e.g. with the link focused).
  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if ((t as Element).closest?.(".hm-cell")) return; // a cell handles its own tap
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      // Return focus to the cell it came from (e.g. from the popover's link) — but only when
      // focus actually has to move: `focus()` on the already-focused cell fires no event, and a
      // suppression flag set for it would go stale and swallow the next arrow-key open.
      const el = cellRefs.current.get(`${pinned.r}-${pinned.c}`);
      if (el && document.activeElement !== el) {
        suppressFocusOpen.current = true;
        el.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const noun = scaleNoun(effMode, playerPosition);
  const refPhrase = referencePhrase(effMode, playerPosition);
  const pctWhere = effMode === "position" ? `among ${positionNoun(playerPosition)}` : "in the league";
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
            Each cell is {firstName(player.name)}'s stat that season vs. {refPhrase} — color shows how far above or below. Tap or hover a cell for its exact gap and a link to that stat's history.
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
          mobile via CSS so desktop keeps overflow:visible and its header tooltips. The popover is
          rendered OUTSIDE this wrapper and positioned fixed, so the wrapper can never clip it. */}
      <div className="hm-scroll">
      <div
        role="grid"
        aria-label={`${firstName(player.name)}'s seasons vs. ${refPhrase}`}
        className="heatmap"
        style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${nCols}, minmax(40px, 1fr))` }}
        onKeyDown={onGridKeyDown}
        onMouseLeave={() => {
          // Leaving the grid ends the hover preview — unless the pointer went onto the popover
          // (1.4.13: hover content must stay hoverable). A pinned popover is unaffected.
          if (!overPopover.current) setHovered(null);
        }}
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
            {row.map((cell, c) => {
              const here = { r, c };
              return (
                <Cell
                  key={`${cell.year}-${cell.statKey}`}
                  cell={cell}
                  pct={cellPercentile(cell, effMode, league, positions, playerPosition)}
                  pctWhere={pctWhere}
                  noun={noun}
                  refPhrase={refPhrase}
                  tabbable={active.r === r && active.c === c}
                  expanded={sameCoord(openCoord, here)}
                  setRef={(el) => cellRefs.current.set(`${r}-${c}`, el)}
                  onFocus={() => {
                    setActive(here);
                    // Arriving by keyboard opens the details — unless this focus is Esc handing
                    // focus back to the cell, which must not re-open what it just closed.
                    if (suppressFocusOpen.current) {
                      suppressFocusOpen.current = false;
                      return;
                    }
                    setPinned(here);
                  }}
                  onHover={() => setHovered(here)}
                  onPress={() => {
                    pressWasPinned.current = sameCoord(pinned, here);
                  }}
                  // Tap/click: a second tap on the open cell closes it, otherwise pin. Decided from
                  // the pointerdown snapshot (focus has already pinned by the time click fires).
                  onTap={() => {
                    const wasPinned = pressWasPinned.current;
                    pressWasPinned.current = false; // a keyboard "click" (Space) has no pointerdown
                    if (wasPinned) {
                      // A deliberate close must actually close: touch browsers synthesize
                      // mouseenter on tap and never mouseleave, so the hover preview would
                      // otherwise keep the popover open after the un-pin.
                      setPinned(null);
                      setHovered(null);
                    } else {
                      setPinned(here);
                    }
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      </div>

      {openCell && openCoord && (
        <CellPopover
          cell={openCell}
          anchor={cellRefs.current.get(`${openCoord.r}-${openCoord.c}`) ?? null}
          noun={noun}
          pct={cellPercentile(openCell, effMode, league, positions, playerPosition)}
          pctWhere={pctWhere}
          pinned={pinned != null}
          popoverRef={popoverRef}
          onPointerEnter={() => {
            overPopover.current = true;
          }}
          onPointerLeave={() => {
            overPopover.current = false;
            if (!pinned) setHovered(null);
          }}
          onDrill={() => {
            close();
            onDrill(openCell.statKey);
          }}
        />
      )}

      {anySmall && (
        <div className="hm-legend-key text-muted" style={{ marginTop: "var(--space-3)" }}>
          <span className="hm-legend-dot" /> small sample (few games or attempts) — not compared
        </div>
      )}
    </section>
  );
}

interface CellPopoverProps {
  cell: HeatmapCell;
  anchor: HTMLElement | null;
  noun: string;
  pct: number | null;
  pctWhere: string;
  pinned: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDrill: () => void;
}

const POPOVER_GAP = 8; // px between the cell and the popover
const VIEWPORT_PAD = 8; // px the popover keeps from the viewport edges

/**
 * The cell's detail line + history link, anchored to the cell. Positioned `fixed` from the
 * cell's viewport rect: above the cell when there's room, else below; horizontally centered and
 * clamped inside the viewport. Re-measured on scroll/resize (either axis, including the grid's
 * own horizontal scroll on phones) so it tracks the cell.
 */
function CellPopover({ cell, anchor, noun, pct, pctWhere, pinned, popoverRef, onPointerEnter, onPointerLeave, onDrill }: CellPopoverProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = popoverRef.current;
      if (!anchor || !el) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Anchor scrolled out of view (the page vertically, or the grid's own horizontal scroll box
      // on a phone) → hide rather than float a popover that points at nothing; it reappears when
      // the cell scrolls back into view.
      const box = (anchor.closest(".hm-scroll") as HTMLElement | null)?.getBoundingClientRect();
      const offscreen =
        a.bottom < 0 || a.top > vh || a.right < 0 || a.left > vw || (box != null && (a.right < box.left || a.left > box.right));
      if (offscreen) {
        setPos(null);
        return;
      }
      // Prefer above; flip below when it would run off the top.
      let top = a.top - h - POPOVER_GAP;
      if (top < VIEWPORT_PAD) top = a.bottom + POPOVER_GAP;
      if (top + h > vh - VIEWPORT_PAD) top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - h);
      let left = a.left + a.width / 2 - w / 2;
      left = Math.min(Math.max(left, VIEWPORT_PAD), vw - VIEWPORT_PAD - w);
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true); // capture: catches the grid's own scroll container too
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, cell, popoverRef]);

  const stat = statName(cell.statKey);
  return (
    <div
      ref={popoverRef}
      id={POPOVER_ID}
      className="hm-popover"
      // Rendered before it's measured, then moved into place; hidden until positioned so the
      // first frame can't flash at (0,0).
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
      data-pinned={pinned ? "true" : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* A column with a clear hierarchy: year (eyebrow) → stat (heading) → value (hero) → the
          reference avg / difference / rank as label–value rows → the link. */}
      <div className="card-kicker hm-popover-year">{cell.year}</div>
      <div className="text-heading hm-popover-stat">{stat}</div>
      <div className="text-heading hm-popover-value" style={cell.smallSample ? { color: "var(--color-neutral-500)" } : undefined}>
        {cell.played ? cell.valueFmt : "—"}
      </div>
      {!cell.played ? (
        <div className="text-muted hm-popover-note">Did not play</div>
      ) : (
        <>
          {(cell.refValue != null || cell.delta != null || pct != null) && (
            <dl className="hm-popover-rows">
              {cell.refValue != null && (
                <>
                  <dt>{noun.charAt(0).toUpperCase() + noun.slice(1)}</dt>
                  <dd>{cell.refFmt}</dd>
                </>
              )}
              {cell.delta != null && (
                <>
                  <dt>Difference</dt>
                  <dd className="hm-popover-delta" style={{ color: cell.up ? "var(--hm-above-text)" : "var(--hm-below-text)" }}>
                    {cell.deltaFmt}
                  </dd>
                </>
              )}
              {pct != null && (
                <>
                  <dt>Percentile</dt>
                  <dd>
                    {ordinal(Math.round(pct))} <span className="text-muted">{pctWhere}</span>
                  </dd>
                </>
              )}
            </dl>
          )}
          {cell.smallSample && <div className="text-muted hm-popover-note">Small sample — not compared</div>}
          {!cell.smallSample && cell.delta == null && <div className="text-muted hm-popover-note">No {noun} that season</div>}
        </>
      )}
      <button type="button" className="btn btn-ghost hm-popover-link" onClick={onDrill}>
        See {stat.toLowerCase()} history ↓
      </button>
    </div>
  );
}

interface CellProps {
  cell: HeatmapCell;
  pct: number | null;
  pctWhere: string;
  noun: string;
  refPhrase: string;
  tabbable: boolean;
  expanded: boolean;
  setRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onHover: () => void;
  /** pointerdown — fires before focus + click, so the parent can snapshot the prior pin state. */
  onPress: () => void;
  onTap: () => void;
}

function Cell({ cell, pct, pctWhere, noun, refPhrase, tabbable, expanded, setRef, onFocus, onHover, onPress, onTap }: CellProps) {
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
  // same detail the popover shows — including the rank — so a screen-reader user gets everything on
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
      aria-expanded={expanded}
      aria-controls={expanded ? POPOVER_ID : undefined}
      onFocus={onFocus}
      onMouseEnter={onHover}
      onPointerDown={onPress}
      onClick={onTap}
    >
      {cell.played ? cell.valueFmt : "—"}
    </button>
  );
}

function statName(key: StatKey): string {
  return STATS.find((s) => s.key === key)?.label ?? key.toUpperCase();
}
