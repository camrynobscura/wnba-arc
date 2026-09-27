import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlayerDetail, SeasonPlayed } from "../data/api";
import { STATS } from "../data/stats";
import { buildHeatmapGrid, compareSentence, firstName, isCountingStat, isRateStat, lowerFirst, type HeatmapCell, type HeatmapMode, type League, ordinal, type PositionLookup, positionNoun, positionSingular, rankNote, scaleNoun, selfModeAvailable, spokenValue, type StatKey, upperFirst } from "../lib/deviation";
import { type GridCoord, gridMove, HEADER_ROW } from "../lib/gridNav";
import { InfoTip } from "./InfoTip";
import { ScaleKey } from "./ScaleKey";

interface DeviationHeatmapProps {
  player: PlayerDetail;
  league: League;
  positions: PositionLookup | null;
  playerPosition: string | null;
  /** The page's reference mode — set in the sticky CompareBar, not here. */
  mode: HeatmapMode;
  /** Go to one stat's year-by-year history — the popover's link, or Enter on a focused cell. */
  onDrill: (statKey: StatKey) => void;
}

// Max saturation a cell reaches (% toward the hue, away from the base). Capped below 100% so
// the in-cell text (var(--color-text), flips with theme) keeps ≥4.5:1 on every cell in BOTH
// themes — a full-saturation gradient passes through a mid-luminance band neither dark nor
// white text can clear.
const MAX_INTENSITY = 75;

/** Spoken phrase for a cell's accessible name ("their career average", "the league average", …). */
function referencePhrase(mode: HeatmapMode, pos: string | null): string {
  if (mode === "self") return "their career average";
  if (mode === "league") return "the league average";
  return `the ${positionSingular(pos)} average`;
}

type Coord = GridCoord;
const sameCoord = (a: Coord | null, b: Coord | null) => a != null && b != null && a.r === b.r && a.c === b.c;

const POPOVER_ID = "hm-popover";
const HINT_ID = "hm-grid-hint";

/**
 * The player's whole career as one season × stat grid, colored by how far each stat sits from a
 * **switchable reference** — their own career, their position peers, or the league (that year).
 * Warm above / cool below. Each cell shows only the value; the *detail* (the reference average, the
 * gap, the rank) lives in a **popover anchored to the cell**: hover previews it, tap or
 * click pins it, arrow-key focus opens it, Esc / click-outside / focus moving on closes it. It carries a link to
 * that stat's full history. Cells never navigate — so a tap on a phone gets the same detail as a
 * mouse, right where the finger is (not in a strip that may be a screen below on a long career).
 *
 * Accessibility: a real ARIA grid with **roving tabindex** — one Tab stop reaches the grid, arrow
 * keys move a single focus around the cells (lib/gridNav). ArrowUp from the top season reaches the
 * column headers, whose explanations open on focus; they used to be eight Tab stops in front of the
 * grid (craftsmanship review 3.2, 2026-09-26). Each cell's accessible name carries value + gap +
 * reference + rank (so nothing is pointer-only), starting with the value as the cell shows it; the
 * "Enter opens that stat's history" instruction is said once, as the grid's description, not in
 * every name (3.5). The open cell is marked aria-expanded and the popover — rendered in DOM order
 * right after the grid, so Tab reaches its link — is positioned `fixed` from the cell's rect, which
 * also lifts it out of the mobile horizontal-scroll container that would otherwise clip it.
 */
export function DeviationHeatmap({
  player,
  league,
  positions,
  playerPosition,
  mode,
  onDrill,
}: DeviationHeatmapProps) {
  // Self mode needs ≥2 seasons to be meaningful (one season vs. itself is all-neutral); a
  // one-season player is offered only the peer modes, and a stray self mode degrades to league.
  const canSelf = selfModeAvailable(player);
  const effMode: HeatmapMode = mode === "self" && !canSelf ? "league" : mode;

  const grid = useMemo(
    () => buildHeatmapGrid(player, effMode, league, positions, playerPosition),
    [player, effMode, league, positions, playerPosition],
  );

  // Roving tabindex: `active` is the focused cell — or column header (r = HEADER_ROW); only it is
  // tabbable. Refs let arrow keys move real DOM focus and let the popover anchor to a cell's rect.
  const [active, setActive] = useState<Coord>({ r: 0, c: 0 });
  const headerRefs = useRef(new Map<number, HTMLButtonElement | null>());
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
  // Where the pointer rested when Esc closed a popover. WebKit sends mouseenter to the cell a closing
  // popover uncovers, with the pointer never moving, so that cell's preview opened at once and Esc
  // looked like it did nothing (measured in Safari's engine, 2026-09-27). A cell's hover arriving at
  // this very spot is ignored; any real move clears it.
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
  const openCell = openCoord ? grid.rows[openCoord.r][openCoord.c] : null;

  // A different player / reference resets everything (the grid's contents changed under it).
  useEffect(() => {
    setPinned(null);
    setHovered(null);
    setActive({ r: 0, c: 0 });
  }, [player, effMode]);

  const focusAt = ({ r, c }: Coord) =>
    (r === HEADER_ROW ? headerRefs.current.get(c) : cellRefs.current.get(`${r}-${c}`))?.focus();
  const close = () => {
    setPinned(null);
    setHovered(null);
    // The popover can close under the pointer (Escape, its own link), and WebKit and Firefox send no
    // pointerleave for a removed element — the flag stayed set, and the next hover preview never
    // closed when the pointer left the grid (measured 2026-09-27).
    overPopover.current = false;
  };
  // Esc's close: also holds hover-opening at the pointer's current spot (see `escapedAt`).
  const dismiss = () => {
    close();
    escapedAt.current = lastPointer.current;
  };
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
      // A column header only explains itself (a header that navigates would surprise — DECISIONS
      // 2026-09-07); its own button handles Enter. On a cell, Enter goes straight to the stat's
      // history — intercepted so the button's native click (which means *pin the popover*) doesn't.
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
    focusAt(next); // onFocus opens the new cell's popover / the header's explanation + syncs `active`
  };

  // Dismiss: Esc anywhere closes the popover, a hover preview too — with the pointer still resting on
  // the cell and focus elsewhere (WCAG 1.4.13: dismissible without moving the pointer; until
  // 2026-09-27 Esc reached only a pinned popover). A click / tap outside the grid + popover closes a
  // pinned one (a preview closes when the pointer leaves).
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
  }, [isOpen, pinned]);

  const noun = scaleNoun(effMode, playerPosition);
  const refPhrase = referencePhrase(effMode, playerPosition);
  // The rank a cell's season holds among the MODE's crowd — the player's position in position mode,
  // otherwise the league — with the pool it's among ("34th of 187 players", "9th of 66 forwards"; a
  // shooting % ranks in its own pool, the seasons over the rank floor: "4th of 65 players").
  // Null for a missed / small-sample cell or a position-year with no bucket. A tinted shooting-% cell
  // under the floor gets a NOTE instead ("Needs 55 attempts from three or 19 made to rank") so the blank says why.
  // The same numbers the drill-down's table and plates show, so the page never disagrees with itself.
  const seasonByYear = new Map(player.seasons.filter((s): s is SeasonPlayed => s.played).map((s) => [s.year, s]));
  const rankNoun = effMode === "position" ? positionNoun(playerPosition) : "players";
  const cellRank = (cell: HeatmapCell): { rank: number; pool: number } | null => {
    if (!cell.played || cell.smallSample) return null;
    const s = seasonByYear.get(cell.year);
    if (!s) return null;
    const k = cell.statKey;
    const rank = effMode === "position" ? s.posRank?.[k] : s.rank?.[k];
    const pool = isRateStat(k) ? (effMode === "position" ? s.posRatePool?.[k] : s.ratePool?.[k]) : effMode === "position" ? s.posPool : s.pool;
    return rank != null && pool != null ? { rank, pool } : null;
  };
  const cellRankNote = (cell: HeatmapCell): string | null => {
    if (!cell.played || cell.smallSample) return null;
    const s = seasonByYear.get(cell.year);
    return s ? rankNote(s, cell.statKey, effMode, playerPosition) : null;
  };

  // Focus moved on to something outside the grid and its popover — Tab past the popover's link,
  // Shift+Tab to the Compare bar, Enter's jump to the stat's history: a popover pinned by that focus
  // closes, or it lingers over whatever has focus now (it covered 28 of 32px of the focused Compare
  // button — a11y review O3, 2026-09-27). Only for a real destination: a click on something that
  // takes no focus blurs with no relatedTarget (Safari and Firefox on a Mac don't focus a clicked
  // button), and the outside-click handler owns that case — closing here would unmount the popover
  // between the press and the click on its own link. A hover preview follows the pointer, not focus.
  const onSectionBlur = (e: React.FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && !e.currentTarget.contains(to)) setPinned(null);
  };

  return (
    <section aria-labelledby="heatmap-title" style={{ margin: "var(--space-1) 0" }} onBlur={onSectionBlur}>
      {/* Visually hidden: the section keeps its accessible name and its place in the heading
          outline, but a sighted reader gets no label — "Season by season" said nothing the grid
          doesn't show, and duplicated the drill-down's "Year by year" (also dropped). First in the
          DOM, ahead of the control, so heading navigation lands before everything in the section. */}
      <h2 id="heatmap-title" className="sr-only">Season-by-season heatmap</h2>
      {/* What's compared, in one sentence that follows the mode ("Each season against A'ja's own
          career averages.") — for a reader arriving cold, which a two-word segment in the bar can't
          do (user, 2026-09-24). Then the one interaction hint (cells open). Sentence left, hint
          right on a wide screen; on a phone the row wraps and they stack. Both sit directly above
          the color key so sentence → key → grid read as one unit. */}
      <div className="text-muted" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", columnGap: "var(--space-4)", rowGap: "var(--space-1)", fontSize: "var(--fs-sm)", marginBottom: "var(--space-3)" }}>
        <p style={{ margin: 0 }}>{compareSentence(effMode, firstName(player.name), playerPosition)}</p>
        <p style={{ margin: 0 }}>Tap or hover over a cell for details.</p>
      </div>

      {/* Diverging color key, adapting its end labels to the current reference. */}
      <div className="scale-legend" style={{ marginBottom: "var(--space-4)" }}>
        <ScaleKey noun={noun} />
      </div>

      {/* The grid's one instruction, said once (as its description) instead of at the end of every
          cell's name (user, 2026-09-26). Hidden: the visible hint above says it for the pointer. */}
      <p id={HINT_ID} className="sr-only">
        Press Enter on a cell to open that stat's history.
      </p>

      {/* Scroll wrapper: on a phone the 8 stat columns can't fit 320px, so the grid scrolls
          horizontally there (a data grid may — WCAG 1.4.10) instead of pushing the page. Scoped to
          mobile via CSS so desktop keeps overflow:visible and its header tooltips. The popover is
          rendered OUTSIDE this wrapper and positioned fixed, so the wrapper can never clip it. */}
      <div className="hm-scroll">
      <div
        role="grid"
        aria-label={`${firstName(player.name)}'s seasons vs. ${refPhrase}`}
        aria-describedby={HINT_ID}
        className="heatmap"
        style={{ gridTemplateColumns: `var(--hm-yearcol) repeat(${nCols}, minmax(var(--hm-cellmin), 1fr))` }}
        onKeyDown={onGridKeyDown}
        onMouseLeave={() => {
          // Leaving the grid ends the hover preview — unless the pointer went onto the popover
          // (1.4.13: hover content must stay hoverable). A pinned popover is unaffected.
          if (!overPopover.current) setHovered(null);
        }}
      >
        {/* Header row: corner + stat column labels (short, full name in a tooltip). Headers only
            explain themselves — they don't select anything (a header that navigates is a surprise).
            They are part of the grid's arrow-key focus (row HEADER_ROW), not Tab stops of their own. */}
        <div role="row" style={{ display: "contents" }}>
          {/* Corner over the year column — sr-only text (not aria-label) so it isn't an empty
              header (axe empty-table-header wants real content); "Season" won't fit visibly. */}
          <div role="columnheader" className="hm-colhead"><span className="sr-only">Season</span></div>
          {STATS.map((st, c) => (
            <div role="columnheader" key={`h-${st.key}`} className="hm-colhead" onFocus={() => setActive({ r: HEADER_ROW, c })}>
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
              <span className="hm-year-full">{grid.years[r]}</span>
              <span className="hm-year-short">{`'${String(grid.years[r]).slice(2)}`}</span>
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
                    // Arriving by keyboard opens the details — unless this focus is Esc handing
                    // focus back to the cell, which must not re-open what it just closed.
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

      {/* No key for the asterisk: the popover's footnote line explains it (a one-line key under the
          grid was added and cut on 2026-09-25 — clutter; "if you want to know what the asterisk
          means, you can click on it"). */}
    </section>
  );
}

interface CellPopoverProps {
  cell: HeatmapCell;
  anchor: HTMLElement | null;
  noun: string;
  rank: { rank: number; pool: number } | null;
  /** "players" / "forwards" — the crowd the rank is among ("34th of 187 players"). */
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
 * The cell's detail line + history link, anchored to the cell. Positioned `fixed` from the
 * cell's viewport rect: above the cell when there's room, else below; horizontally centered and
 * clamped inside the viewport. Re-measured on scroll/resize (either axis, including the grid's
 * own horizontal scroll on phones) so it tracks the cell.
 */
function CellPopover({ cell, anchor, noun, rank, rankNote, rankNoun, pinned, popoverRef, onPointerEnter, onPointerLeave, onDrill }: CellPopoverProps) {
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
      {/* The stat as the title, then ONE tier of label/value rows — the season's own value first
          (the year is its label), then the reference avg / difference / rank — then the link. No
          eyebrow, no hero number: tighter, and the season's value reads as a row of the same table
          as the numbers it's compared to. The exact one-decimal value lives here; the cell shows the
          rounded glance form. refValue / delta / pct are all null for a missed season, so only the
          year row renders there. */}
      <div className="text-heading hm-popover-stat">{stat}</div>
      <dl className="hm-popover-rows">
        <dt>{cell.year}</dt>
        {/* Never dimmed for a small sample (dropped 2026-09-25: the mid grey measured 2.4:1 / 2.2:1,
            an AA failure on main; the grey cell and the "* Small sample …" footnote already say it). */}
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
            <dd className="hm-popover-delta" style={{ color: cell.up ? "var(--hm-above-text)" : "var(--hm-below-text)" }}>
              {cell.deltaFmt}
            </dd>
          </>
        )}
        {rank && (
          <>
            <dt>Rank</dt>
            {/* The same rank the table and the Best-rank plate show (a percentile lived here until
                2026-09-21; the rank is what the rest of the page uses). */}
            <dd>
              {ordinal(rank.rank)} <span className="text-muted">of {rank.pool} {rankNoun}</span>
            </dd>
          </>
        )}
        {!rank && rankNote && (
          <>
            <dt>Rank</dt>
            {/* Compared but not ranked: a shooting % under the API's rank floor. Say why rather
                than leave the row off — a blank next to a red cell reads as "not good enough". */}
            <dd className="text-muted">{rankNote}</dd>
          </>
        )}
      </dl>
      {!cell.played && <div className="text-muted hm-popover-note">Did not play</div>}
      {/* The asterisk's footnote (user, 2026-09-25): the cell's mark points here — the same asterisk,
          in italics, under the rows every cell has. Grey and partial cells alike; the count is in
          sampleNote. The only explanation of the mark on the page — a key under the grid was tried
          and cut the same night as clutter. */}
      {cell.played && cell.note && (
        <div className="text-muted hm-popover-note">
          <em>* {cell.note}</em>
        </div>
      )}
      {cell.played && !cell.smallSample && cell.delta == null && <div className="text-muted hm-popover-note">No {noun} that season</div>}
      <button type="button" className="btn btn-ghost hm-popover-link" onClick={onDrill}>
        {/* The arrow is decoration — hidden, or it's read out ("down arrow"). One wrapping span: `.btn`
            is a flex box, and the arrow as its own flex item would sit a 6px gap away, not a space. */}
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
  /** pointerdown — fires before focus + click, so the parent can snapshot the prior pin state. */
  onPress: () => void;
  onTap: () => void;
}

function Cell({ cell, rank, rankNote, rankNoun, noun, refPhrase, tabbable, expanded, setRef, onFocus, onHover, onPress, onTap }: CellProps) {
  // Background: diverging color for a scored cell; the neutral base for a played cell with no
  // reference; class-driven grey for small-sample; empty for a missed season.
  const bg =
    !cell.played || cell.smallSample
      ? undefined
      : cell.colorT == null
        ? "var(--hm-base)"
        : `color-mix(in srgb, ${cell.colorT >= 0 ? "var(--hm-above)" : "var(--hm-below)"} ${Math.abs(cell.colorT) * MAX_INTENSITY}%, var(--hm-base))`;

  // Grey for a small sample; the asterisk (.hm-ss) for any cell with a caveat — small OR partial.
  const cls = "hm-cell" + (!cell.played ? " hm-empty" : "") + (cell.smallSample ? " hm-muted" : "") + (cell.smallSample || cell.partial ? " hm-ss" : "");

  // Accessible name: the full line (a grid doesn't auto-associate its headers like a table), the
  // same detail the popover shows — including the rank — so a screen-reader user gets everything on
  // the cell itself. The value as the cell shows it, then exact ("53%, exactly 52.7%" — the name
  // must contain the visible label, WCAG 2.5.3). The Enter instruction is the grid's description.
  const stat = statName(cell.statKey);
  const shown = spokenValue(cell.cellFmt, cell.valueFmt);
  const detail = !cell.played
    ? `${stat} ${cell.year}: did not play`
    : cell.smallSample
      ? `${stat} ${cell.year}: ${shown}, ${lowerFirst(cell.note ?? "small sample — not compared")}`
      : cell.delta == null
        ? `${stat} ${cell.year}: ${shown}, no ${noun} that season`
        : `${stat} ${cell.year}: ${shown}, ${cell.deltaFmt}${isCountingStat(cell.statKey) ? "" : " percentage points"} vs ${refPhrase}` +
          (cell.note ? `, ${lowerFirst(cell.note)}` : "") +
          (rank ? `, ranked ${ordinal(rank.rank)} of ${rank.pool} ${rankNoun}` : rankNote ? `, not ranked: ${lowerFirst(rankNote)}` : "");

  return (
    <button
      ref={setRef}
      role="gridcell"
      type="button"
      className={cls}
      style={bg ? { background: bg, color: "var(--color-text)" } : undefined}
      tabIndex={tabbable ? 0 : -1}
      aria-label={detail}
      aria-expanded={expanded}
      aria-controls={expanded ? POPOVER_ID : undefined}
      onFocus={onFocus}
      onMouseEnter={(e) => onHover(e.clientX, e.clientY)}
      onPointerDown={onPress}
      onClick={onTap}
    >
      {cell.cellFmt}
    </button>
  );
}

function statName(key: StatKey): string {
  return STATS.find((s) => s.key === key)?.label ?? key.toUpperCase();
}
