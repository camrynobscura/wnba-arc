import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlayerDetail, SeasonPlayed } from "../data/api";
import { STATS } from "../data/stats";
import {
  buildHeatmapGrid,
  compareSentence,
  firstName,
  isCountingStat,
  isRateStat,
  lowerFirst,
  type HeatmapCell,
  type HeatmapMode,
  type League,
  ordinal,
  type PositionLookup,
  positionNoun,
  rankNote,
  referencePhrase,
  scaleNoun,
  selfModeAvailable,
  spokenValue,
  type StatKey,
  upperFirst,
} from "../lib/deviation";
import { type GridCoord, gridMove, HEADER_ROW } from "../lib/gridNav";
import { InfoTip } from "./InfoTip";
import { ScaleKey } from "./ScaleKey";

interface DeviationHeatmapProps {
  player: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
  playerPosition: string | null;
  /** The page's reference mode, set in the sticky CompareBar. */
  mode: HeatmapMode;
  /** Go to one stat's history: the popover's link, or Enter on a focused cell. */
  onDrill: (statKey: StatKey) => void;
}

// How far a cell mixes toward its hue at full strength (%). Capped below 100 so the cell's text keeps
// 4.5:1 in both themes: a full-strength gradient passes through a mid-lightness band that neither dark
// nor light text can clear.
const MAX_INTENSITY = 75;

type Coord = GridCoord;
const sameCoord = (a: Coord | null, b: Coord | null) => a != null && b != null && a.r === b.r && a.c === b.c;

const POPOVER_ID = "hm-popover";
const HINT_ID = "hm-grid-hint";

/**
 * The player's career as a season × stat grid, colored by how far each stat sits from the chosen
 * reference: their own career, their position, or the league that year. Each cell shows only the value;
 * the reference, the gap and the rank are in a popover anchored to the cell (hover previews it, a tap or
 * click pins it, keyboard focus opens it; Escape, a click outside or focus moving on closes it), with a
 * link to the stat's history. Cells never navigate, so a tap on a phone gets the same detail as a mouse.
 *
 * Accessibility: an ARIA grid with a roving tabindex (lib/gridNav): one Tab stop, arrow keys between the
 * cells, and ArrowUp from the top season into the column headers. Each cell's spoken text carries the
 * value, gap, reference and rank, so nothing is pointer-only; the Enter instruction is said once, as the
 * grid's description. The popover comes right after the grid in DOM order, so Tab reaches its link.
 */
export function DeviationHeatmap({ player, league, positions, playerPosition, mode, onDrill }: DeviationHeatmapProps) {
  // Self mode needs two or more seasons; a one-season player who arrives in self mode gets league.
  const canSelf = selfModeAvailable(player);
  const effMode: HeatmapMode = mode === "self" && !canSelf ? "league" : mode;

  const grid = useMemo(
    () => buildHeatmapGrid(player, effMode, league, positions, playerPosition),
    [player, effMode, league, positions, playerPosition],
  );

  // Roving tabindex: `active` is the focused cell or column header (r = HEADER_ROW); only it is
  // tabbable. Refs let arrow keys move real DOM focus and let the popover anchor to a cell's rect.
  const [active, setActive] = useState<Coord>({ r: 0, c: 0 });
  const headerRefs = useRef(new Map<number, HTMLButtonElement | null>());
  // Popover state: `pinned` = tapped, clicked or keyboard-focused, and stays until dismissed; `hovered` =
  // the pointer's preview. Open = pinned, else hovered.
  const [pinned, setPinned] = useState<Coord | null>(null);
  const [hovered, setHovered] = useState<Coord | null>(null);
  // A different player or reference resets the popover and the focus position (the grid's contents changed
  // under them). Adjusted during render, React's pattern for state that follows a prop, so no render shows the
  // old coordinates on the new grid.
  const [shownFor, setShownFor] = useState({ player, effMode });
  if (shownFor.player !== player || shownFor.effMode !== effMode) {
    setShownFor({ player, effMode });
    setPinned(null);
    setHovered(null);
    setActive({ r: 0, c: 0 });
  }
  const cellRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const overPopover = useRef(false);
  // A mouse click fires `focus` (which pins) BEFORE `click`, so a plain toggle in `click` would
  // undo the pin every time. `pointerdown` runs before both and records whether this cell was
  // already pinned; `click` then decides pin-vs-close from that.
  const pressWasPinned = useRef(false);
  // Esc returns focus to the cell; that programmatic focus must not re-open the popover.
  const suppressFocusOpen = useRef(false);
  // Where the pointer rested when Esc closed a popover. WebKit sends mouseenter to the cell a closing
  // popover uncovers, with the pointer never moving, so that cell's preview opened at once and Esc
  // looked like it did nothing. A hover arriving at this exact spot is ignored; any real move clears it.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const escapedAt = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
  const nRows = grid.years.length;
  const nCols = STATS.length;

  const openCoord = pinned ?? hovered;
  // Optional: the render that resets the state above still runs once with the previous player's coordinates
  // (React then discards it), and they can point past the new grid.
  const openCell = openCoord ? (grid.rows[openCoord.r]?.[openCoord.c] ?? null) : null;

  const focusAt = ({ r, c }: Coord) =>
    (r === HEADER_ROW ? headerRefs.current.get(c) : cellRefs.current.get(`${r}-${c}`))?.focus();
  const close = useCallback(() => {
    setPinned(null);
    setHovered(null);
    // The popover can close under the pointer (Escape, its own link), and WebKit and Firefox send no
    // pointerleave for a removed element: the flag stayed set, and the next hover preview never closed
    // when the pointer left the grid.
    overPopover.current = false;
  }, []);
  // Esc's close: also holds hover-opening at the pointer's current spot (see `escapedAt`).
  const dismiss = useCallback(() => {
    close();
    escapedAt.current = lastPointer.current;
  }, [close]);
  const onCellHover = (here: Coord, x: number, y: number) => {
    const held = escapedAt.current;
    if (held && Math.abs(held.x - x) < 1 && Math.abs(held.y - y) < 1) return;
    escapedAt.current = null;
    setHovered(here);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      dismiss();
      return;
    }
    if (e.key === "Enter") {
      // A column header only explains itself; its own button handles Enter. On a cell, Enter goes
      // straight to the stat's history, intercepted so the button's native click (which pins the
      // popover) doesn't happen.
      if (active.r === HEADER_ROW) return;
      e.preventDefault();
      onDrill(grid.rows[active.r][active.c].statKey);
      return;
    }
    const next = gridMove(active, e.key, nRows, nCols);
    if (!next) return;
    e.preventDefault();
    // Up into the headers: the cell's popover closes, so it and the header's explanation are never
    // both open.
    if (next.r === HEADER_ROW) close();
    focusAt(next); // onFocus opens the new cell's popover or the header's explanation, and syncs `active`
  };

  // Esc anywhere closes the popover, a hover preview too, with the pointer still on the cell (WCAG 1.4.13:
  // dismissible without moving the pointer). A click or tap outside the grid and popover closes a pinned
  // one; a preview closes when the pointer leaves.
  const isOpen = openCoord != null;
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!pinned) return;
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if ((t as Element).closest?.(".hm-cell")) return; // a cell handles its own tap
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dismiss();
      if (!pinned) return; // a hover preview: focus was never the popover's to move
      // Return focus to the cell it came from (from the popover's link, say), but only when it has to
      // move: `focus()` on the already-focused cell fires no event, and a suppression flag set for it
      // would go stale and swallow the next arrow-key open.
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
  }, [isOpen, pinned, close, dismiss]);

  const noun = scaleNoun(effMode, playerPosition);
  const refPhrase = referencePhrase(effMode, playerPosition);
  // The rank a cell's season holds among the mode's crowd (the position in position mode, otherwise the
  // league) and its pool ("34th of 187 players"); a shooting % ranks in its own pool. Null for a missed or
  // small-sample cell, or a position-year with no group. A colored shooting-% cell under the rank floor
  // gets a note instead, so the blank says why. The same numbers the table and plates show.
  const seasonByYear = new Map(player.seasons.filter((s): s is SeasonPlayed => s.played).map((s) => [s.year, s]));
  const rankNoun = effMode === "position" ? positionNoun(playerPosition) : "players";
  const cellRank = (cell: HeatmapCell): { rank: number; pool: number } | null => {
    if (!cell.played || cell.smallSample) return null;
    const s = seasonByYear.get(cell.year);
    if (!s) return null;
    const k = cell.statKey;
    const rank = effMode === "position" ? s.posRank?.[k] : s.rank?.[k];
    const pool = isRateStat(k)
      ? effMode === "position"
        ? s.posRatePool?.[k]
        : s.ratePool?.[k]
      : effMode === "position"
        ? s.posPool
        : s.pool;
    return rank != null && pool != null ? { rank, pool } : null;
  };
  const cellRankNote = (cell: HeatmapCell): string | null => {
    if (!cell.played || cell.smallSample) return null;
    const s = seasonByYear.get(cell.year);
    return s ? rankNote(s, cell.statKey, effMode, playerPosition) : null;
  };

  // Focus moved outside the grid and its popover (Tab past the popover's link, Shift+Tab to the compare
  // bar, Enter's jump to the history): a popover pinned by focus closes, or it would sit over whatever
  // has focus now. Only for a real destination: a click on something that takes no focus blurs with no
  // relatedTarget (Safari and Firefox on a Mac don't focus a clicked button), and the outside-click
  // handler owns that case; closing here would unmount the popover between the press and the click on
  // its own link. A hover preview follows the pointer, not focus.
  const onSectionBlur = (e: React.FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && !e.currentTarget.contains(to)) setPinned(null);
  };

  return (
    <section aria-labelledby="heatmap-title" style={{ margin: "var(--space-1) 0" }} onBlur={onSectionBlur}>
      {/* Visually hidden: the section keeps its name and its place in the heading outline, but a visible
          label would say nothing the grid doesn't show. First in the section, so heading navigation
          lands before everything in it. */}
      <h2 id="heatmap-title" className="sr-only">
        Season-by-season heatmap
      </h2>
      {/* What's compared, in a sentence that follows the mode, for a reader arriving cold; then the one
          interaction hint. Both sit right above the color key, so sentence, key and grid read as one. */}
      <div
        className="text-muted"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          columnGap: "var(--space-4)",
          rowGap: "var(--space-1)",
          fontSize: "var(--fs-sm)",
          marginBottom: "var(--space-3)",
        }}
      >
        <p style={{ margin: 0 }}>{compareSentence(effMode, firstName(player.name), playerPosition)}</p>
        <p style={{ margin: 0 }}>Tap or hover over a cell for details.</p>
      </div>

      <div className="scale-legend" style={{ marginBottom: "var(--space-4)" }}>
        <ScaleKey noun={noun} />
      </div>

      {/* The grid's one instruction, said once as its description rather than in every cell. Hidden: the
          visible hint above covers the pointer. */}
      <p id={HINT_ID} className="sr-only">
        Press Enter on a cell to open that stat's history.
      </p>

      {/* The popover is rendered outside this scroller and positioned fixed, so the scroller can't clip it. */}
      <div className="hm-scroll">
        <div
          role="grid"
          aria-label={`${firstName(player.name)}'s seasons vs. ${refPhrase}`}
          aria-describedby={HINT_ID}
          className="heatmap"
          style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${nCols}, minmax(var(--hm-cellmin), 1fr))` }}
          onKeyDown={onGridKeyDown}
          onMouseLeave={() => {
            // Leaving the grid ends the hover preview, unless the pointer went onto the popover (WCAG
            // 1.4.13: hover content must stay hoverable). A pinned popover is unaffected.
            if (!overPopover.current) setHovered(null);
          }}
        >
          {/* Header row: a corner, then the stat labels (full name in a tooltip). Headers only explain
            themselves; they're part of the grid's arrow-key focus (row HEADER_ROW), not Tab stops. */}
          <div role="row" style={{ display: "contents" }}>
            {/* Hidden text, not aria-label, so it isn't an empty header (axe's empty-table-header rule);
              "Season" won't fit visibly. */}
            <div role="columnheader" className="hm-colhead">
              <span className="sr-only">Season</span>
            </div>
            {STATS.map((st, c) => (
              <div
                role="columnheader"
                key={`h-${st.key}`}
                className="hm-colhead"
                onFocus={() => setActive({ r: HEADER_ROW, c })}
              >
                <InfoTip
                  label={st.short}
                  tip={st.desc}
                  tabIndex={active.r === HEADER_ROW && active.c === c ? 0 : -1}
                  triggerRef={(el) => headerRefs.current.set(c, el)}
                />
              </div>
            ))}
          </div>

          {grid.rows.map((row, r) => (
            <div role="row" style={{ display: "contents" }} key={grid.years[r]}>
              <div role="rowheader" className="hm-rowhead">
                {/* Drawn as "2024", or "'24" on a phone (CSS shows one); a screen reader always gets the
                  full year. */}
                <span className="hm-year-full" aria-hidden="true">
                  {grid.years[r]}
                </span>
                <span className="hm-year-short" aria-hidden="true">{`'${String(grid.years[r]).slice(2)}`}</span>
                <span className="sr-only">{grid.years[r]}</span>
              </div>
              {row.map((cell, c) => {
                const here = { r, c };
                return (
                  <Cell
                    key={`${cell.year}-${cell.statKey}`}
                    cell={cell}
                    rank={cellRank(cell)}
                    rankNote={cellRankNote(cell)}
                    rankNoun={rankNoun}
                    noun={noun}
                    refPhrase={refPhrase}
                    tabbable={active.r === r && active.c === c}
                    expanded={sameCoord(openCoord, here)}
                    setRef={(el) => cellRefs.current.set(`${r}-${c}`, el)}
                    onFocus={() => {
                      setActive(here);
                      // Arriving by keyboard opens the details, unless this is Esc handing focus back
                      // to the cell, which must not reopen what it just closed.
                      if (suppressFocusOpen.current) {
                        suppressFocusOpen.current = false;
                        return;
                      }
                      setPinned(here);
                    }}
                    onHover={(x, y) => onCellHover(here, x, y)}
                    onPress={() => {
                      pressWasPinned.current = sameCoord(pinned, here);
                    }}
                    // Tap/click: a second tap on the open cell closes it, otherwise pin. Decided from
                    // the pointerdown snapshot (focus has already pinned by the time click fires).
                    onTap={() => {
                      const wasPinned = pressWasPinned.current;
                      pressWasPinned.current = false; // a keyboard "click" (Space) has no pointerdown
                      if (wasPinned) {
                        // A deliberate close must close: touch browsers synthesize mouseenter on tap
                        // and never mouseleave, so the hover preview would keep the popover open.
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
          anchorKey={`${openCoord.r}-${openCoord.c}`}
          cellRefs={cellRefs}
          noun={noun}
          rank={cellRank(openCell)}
          rankNote={cellRankNote(openCell)}
          rankNoun={rankNoun}
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
    </section>
  );
}

interface CellPopoverProps {
  cell: HeatmapCell;
  /** The open cell's key in `cellRefs` ("row-column"). The element is looked up after render: refs aren't read
      while rendering. */
  anchorKey: string;
  cellRefs: React.RefObject<Map<string, HTMLButtonElement | null>>;
  noun: string;
  rank: { rank: number; pool: number } | null;
  /** "players" / "forwards": the crowd the rank is among ("34th of 187 players"). */
  rankNoun: string;
  /** Why a tinted shooting-% cell has no rank, when it doesn't ("Needs 55 attempts from three or 19 made to rank"). */
  rankNote: string | null;
  pinned: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDrill: () => void;
}

const POPOVER_GAP = 8; // px between the cell and the popover
const VIEWPORT_PAD = 8; // px the popover keeps from the viewport edges

/**
 * The cell's details and history link, anchored to the cell. Positioned `fixed` from the cell's
 * viewport rect: above the cell when there's room, else below; centered and clamped inside the
 * viewport. Re-measured on scroll and resize (including the grid's own sideways scroll) so it tracks
 * the cell.
 */
function CellPopover({
  cell,
  anchorKey,
  cellRefs,
  noun,
  rank,
  rankNote,
  rankNoun,
  pinned,
  popoverRef,
  onPointerEnter,
  onPointerLeave,
  onDrill,
}: CellPopoverProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = cellRefs.current.get(anchorKey) ?? null;
    const place = () => {
      const el = popoverRef.current;
      if (!anchor || !el) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // The cell scrolled out of view (the page, or the grid's own scroller): hide rather than float a
      // popover that points at nothing. It reappears when the cell scrolls back.
      const box = (anchor.closest(".hm-scroll") as HTMLElement | null)?.getBoundingClientRect();
      const offscreen =
        a.bottom < 0 ||
        a.top > vh ||
        a.right < 0 ||
        a.left > vw ||
        (box != null && (a.right < box.left || a.left > box.right));
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
  }, [anchorKey, cellRefs, cell, popoverRef]);

  const stat = statName(cell.statKey);
  return (
    <div
      ref={popoverRef}
      id={POPOVER_ID}
      className="hm-popover"
      // Rendered, measured, then moved into place; hidden until positioned so the first frame can't
      // flash at (0,0).
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
      data-pinned={pinned ? "true" : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* The stat as the title, then one tier of label/value rows (the season's value, the reference,
          the gap, the rank), then the link. A missed season has no reference, gap or rank, so only
          the year row renders. */}
      <div className="text-heading hm-popover-stat">{stat}</div>
      <dl className="hm-popover-rows">
        <dt>{cell.year}</dt>
        <dd>{cell.valueFmt}</dd>
        {cell.refValue != null && (
          <>
            <dt>{upperFirst(noun)}</dt>
            <dd>{cell.refFmt}</dd>
          </>
        )}
        {cell.delta != null && (
          <>
            <dt>Difference</dt>
            <dd
              className="hm-popover-delta"
              style={{
                color: cell.flat
                  ? "var(--color-text-muted)"
                  : cell.up
                    ? "var(--hm-above-text)"
                    : "var(--hm-below-text)",
              }}
            >
              {cell.deltaFmt}
            </dd>
          </>
        )}
        {rank && (
          <>
            <dt>Rank</dt>
            <dd>
              {ordinal(rank.rank)}{" "}
              <span className="text-muted">
                of {rank.pool} {rankNoun}
              </span>
            </dd>
          </>
        )}
        {!rank && rankNote && (
          <>
            <dt>Rank</dt>
            {/* Compared but not ranked: say why, since a blank next to a red cell reads as "not good
                enough". */}
            <dd className="text-muted">{rankNote}</dd>
          </>
        )}
      </dl>
      {!cell.played && <div className="text-muted hm-popover-note">Did not play</div>}
      {/* The note the cell's asterisk points to, with the same asterisk. */}
      {cell.played && cell.note && (
        <div className="text-muted hm-popover-note">
          <em>* {cell.note}</em>
        </div>
      )}
      {cell.played && !cell.smallSample && cell.delta == null && (
        <div className="text-muted hm-popover-note">No {noun} that season</div>
      )}
      <button type="button" className="btn btn-ghost hm-popover-link" onClick={onDrill}>
        {/* The arrow is decoration, hidden or it's read out ("down arrow"). One wrapping span: `.btn` is
            a flex box, and the arrow as its own flex item would sit a 6px gap away, not a space. */}
        <span>
          See {stat.toLowerCase()} history <span aria-hidden="true">↓</span>
        </span>
      </button>
    </div>
  );
}

interface CellProps {
  cell: HeatmapCell;
  rank: { rank: number; pool: number } | null;
  rankNoun: string;
  /** Why a tinted shooting-% cell has no rank, when it doesn't ("Needs 55 attempts from three or 19 made to rank"). */
  rankNote: string | null;
  noun: string;
  refPhrase: string;
  tabbable: boolean;
  expanded: boolean;
  setRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  /** mouseenter, with the pointer's viewport position. */
  onHover: (x: number, y: number) => void;
  /** pointerdown: fires before focus and click, so the parent can snapshot the prior pin state. */
  onPress: () => void;
  onTap: () => void;
}

function Cell({
  cell,
  rank,
  rankNote,
  rankNoun,
  noun,
  refPhrase,
  tabbable,
  expanded,
  setRef,
  onFocus,
  onHover,
  onPress,
  onTap,
}: CellProps) {
  // The heat color for a scored cell; the neutral base for a played cell with no reference; none for a
  // small sample (its class draws it hollow) or a missed season.
  const bg =
    !cell.played || cell.smallSample
      ? undefined
      : cell.colorT == null
        ? "var(--hm-base)"
        : `color-mix(in srgb, ${cell.colorT >= 0 ? "var(--hm-above)" : "var(--hm-below)"} ${Math.abs(cell.colorT) * MAX_INTENSITY}%, var(--hm-base))`;

  // The asterisk (.hm-ss, on the drawn value) marks any cell with a caveat, small or partial.
  const cls = "hm-cell" + (!cell.played ? " hm-empty" : "") + (cell.smallSample ? " hm-muted" : "");
  const marked = cell.smallSample || cell.partial;

  // The cell's spoken text: the full line the popover shows, rank included, so a screen-reader user gets
  // everything on the cell (a grid doesn't pair cells with their headers the way a table does). The value
  // as the cell shows it comes first, then the exact value (WCAG 2.5.3).
  const stat = statName(cell.statKey);
  const shown = spokenValue(cell.cellFmt, cell.valueFmt);
  const ref = cell.refValue != null ? cell.refFmt : null;
  const detail = !cell.played
    ? `${stat} ${cell.year}: did not play`
    : cell.smallSample
      ? `${stat} ${cell.year}: ${shown}, ${ref ? `${refPhrase} ${ref}, ` : ""}${lowerFirst(cell.note ?? "small sample — not compared")}`
      : cell.delta == null
        ? `${stat} ${cell.year}: ${shown}, no ${noun} that season`
        : `${stat} ${cell.year}: ${shown}, ${cell.deltaFmt}${isCountingStat(cell.statKey) ? "" : " percentage points"} vs ${refPhrase}${ref ? ` of ${ref}` : ""}` +
          (cell.note ? `, ${lowerFirst(cell.note)}` : "") +
          (rank
            ? `, ranked ${ordinal(rank.rank)} of ${rank.pool} ${rankNoun}`
            : rankNote
              ? `, not ranked: ${lowerFirst(rankNote)}`
              : "");

  return (
    <button
      ref={setRef}
      role="gridcell"
      type="button"
      className={cls}
      style={bg ? { background: bg, color: "var(--color-text)" } : undefined}
      tabIndex={tabbable ? 0 : -1}
      // No aria-expanded: focus opens the popover, so a screen reader heard "expanded" on every cell,
      // which told the listener nothing.
      aria-controls={expanded ? POPOVER_ID : undefined}
      onFocus={onFocus}
      onMouseEnter={(e) => onHover(e.clientX, e.clientY)}
      onPointerDown={onPress}
      onClick={onTap}
    >
      {/* The line is the cell's content, not an aria-label: VoiceOver in Safari reads a grid cell's
          aria-label and then its content, so the value was read again after the line (or "blank", with
          it hidden). The asterisk rides on the drawn value, so it's hidden too; it still draws in the
          button's corner. */}
      <span aria-hidden="true" className={marked ? "hm-ss" : undefined}>
        {cell.cellFmt}
      </span>
      <span className="sr-only">{detail}</span>
    </button>
  );
}

function statName(key: StatKey): string {
  return STATS.find((s) => s.key === key)?.label ?? key.toUpperCase();
}
