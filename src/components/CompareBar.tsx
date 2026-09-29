import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { type CompareSegment, firstName, type HeatmapMode } from "../lib/deviation";
import { asSentence } from "./InfoTip";

/** The most of the window's height the bar may cover and still stick (see the effect in CompareBar). */
const MAX_STUCK_SHARE = 0.2;

interface CompareBarProps {
  /** The player's full name; the bar shows the first name ("A'ja vs …"). */
  playerName: string;
  mode: HeatmapMode;
  /** Always three (lib/deviation `compareSegments`); unavailable ones are disabled with a reason. */
  segments: CompareSegment[];
  onModeChange: (m: HeatmapMode) => void;
}

/**
 * The player page's one sticky bar: which reference every number on the page is measured against. It's
 * the only control that changes both sections, so it's the one thing worth pinning while the reader
 * scrolls a long career.
 *
 * Three real buttons in a named group, `aria-pressed` marking the current one: three Tab stops, no
 * roving-tabindex code to get wrong. A mode the page can't offer is shown disabled rather than hidden,
 * so the bar keeps its shape from player to player, and stays focusable (`aria-disabled`, not
 * `disabled`) so its reason is reachable by keyboard and screen reader, in a tooltip that also opens on
 * hover and tap.
 */
export function CompareBar({ playerName, mode, segments, onModeChange }: CompareBarProps) {
  const first = firstName(playerName);
  // The page's scroll clearance (`--compare-bar-h`, theme.css) is the bar's height, measured here: with
  // enlarged text on a phone the bar wraps onto two or three lines, and a focused element must still stop
  // below it (WCAG 2.4.11).
  //
  // A bar taller than a fifth of the window stops sticking (`data-unstuck`) and scrolls away, so a reader
  // with enlarged text keeps most of the screen; no clearance is needed then. Re-decided when the bar
  // changes size or the window changes width, not on height alone: a phone's toolbar shows and hides as
  // the page scrolls, and the bar would flip between the two mid-scroll.
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const host = bar?.closest<HTMLElement>(".has-compare-bar");
    if (!bar || !host) return;
    const sync = () => {
      const tooTall = bar.offsetHeight > window.innerHeight * MAX_STUCK_SHARE;
      bar.toggleAttribute("data-unstuck", tooTall);
      host.style.setProperty("--compare-bar-h", tooTall ? "0px" : `${bar.offsetHeight}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      sync();
    };
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      host.style.removeProperty("--compare-bar-h");
    };
  }, []);
  return (
    <div className="compare-bar" ref={barRef}>
      <div className="seg-wrap">
        {/* "A'ja vs": the player stays named once the header has scrolled away. Hidden from screen
            readers; the group's name says the same thing. */}
        <span className="seg-lead" aria-hidden="true">
          <span className="seg-who">{first}</span>
          <span className="seg-vs">vs</span>
        </span>
        <div role="group" aria-label={`Compare ${first} to`} className="seg">
          {segments.map((s) => (
            <Segment key={s.value} segment={s} pressed={s.value === mode} onSelect={() => onModeChange(s.value)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Segment({ segment, pressed, onSelect }: { segment: CompareSegment; pressed: boolean; onSelect: () => void }) {
  const tipId = useId();
  // A disabled segment's reason: opened by hover, focus or tap (the tap does nothing else), closed by
  // leaving, blur or Escape (WCAG 1.4.13). A tap opens rather than toggles: touch browsers fire an
  // emulated mouseenter before the click, so a toggle would open on the first and close on the second.
  const [tipOpen, setTipOpen] = useState(false);
  const disabled = segment.disabled;

  // Escape closes the reason wherever focus is: it may have opened on hover, with focus elsewhere.
  useEffect(() => {
    if (!tipOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTipOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tipOpen]);

  // The reason bubble sits beside the button in a shared wrapper, not inside it: inside, it became part
  // of the button's name whenever it opened, and it was drawn at the disabled button's 45% opacity.
  // Hover is tracked on the wrapper, so the pointer can move onto the bubble without closing it.
  return (
    <span
      className="seg-item"
      onMouseEnter={disabled ? () => setTipOpen(true) : undefined}
      onMouseLeave={disabled ? () => setTipOpen(false) : undefined}
    >
      <button
        type="button"
        className="seg-btn"
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? tipId : undefined}
        onClick={() => (disabled ? setTipOpen(true) : onSelect())}
        onFocus={disabled ? () => setTipOpen(true) : undefined}
        onBlur={disabled ? () => setTipOpen(false) : undefined}
      >
        {segment.label}
      </button>
      {disabled && (
        <span role="tooltip" id={tipId} className={"infotip-bubble seg-tip" + (tipOpen ? " is-open" : "")}>
          {segment.reason && asSentence(segment.reason)}
        </span>
      )}
    </span>
  );
}
