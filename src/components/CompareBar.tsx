import { useId, useState } from "react";
import { type CompareSegment, firstName, type HeatmapMode } from "../lib/deviation";
import { asSentence } from "./InfoTip";

interface CompareBarProps {
  /** The player's full name; the bar shows the first name ("A'ja vs …"). */
  playerName: string;
  mode: HeatmapMode;
  /** Always three (lib/deviation `compareSegments`), unavailable ones disabled with a reason. */
  segments: CompareSegment[];
  onModeChange: (m: HeatmapMode) => void;
}

/**
 * The player page's one sticky bar: the page-wide lens — which reference every number on the page
 * is measured against. It replaced both in-page "Compare to" dropdowns (heatmap header + a synced
 * copy in the drill-down) and the app-wide nav: the comparison is the only control that changes
 * both sections, so it is the one thing worth pinning while the reader scrolls a long career. It
 * carries nothing else — a cut with "← All players" in it left the search floating alone in the
 * row above, so the back button went back up there (DECISIONS, 2026-09-23).
 *
 * The control is three real buttons in a named group, `aria-pressed` marking the current one —
 * three Tab stops, no roving-tabindex code to get wrong. A mode the page can't honor is shown
 * DISABLED rather than hidden, so the bar keeps its shape from player to player; it stays
 * focusable (`aria-disabled`, not `disabled`) so the reason is reachable by keyboard and screen
 * reader, in a tooltip that also opens on hover and on tap. The visible "vs" is decoration for
 * sighted readers only — the group's name already says "Compare to".
 */
export function CompareBar({ playerName, mode, segments, onModeChange }: CompareBarProps) {
  const first = firstName(playerName);
  return (
    <div className="compare-bar">
      <div className="seg-wrap">
        {/* "A'ja vs" — the subject stays named while the header has scrolled away. Decoration for
            sighted readers; the group's accessible name carries the same sentence. */}
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
  // A disabled segment's reason: open on hover / focus / tap (the tap does nothing else), closed
  // on leave / blur / Escape (WCAG 1.4.13 — dismissible without moving the pointer). A tap OPENS
  // rather than toggles: touch browsers fire an emulated mouseenter before the click, so a toggle
  // would open on the first and close on the second, and the reason would never show on a phone.
  const [tipOpen, setTipOpen] = useState(false);
  const disabled = segment.disabled;

  return (
    <button
      type="button"
      className="seg-btn"
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      aria-describedby={disabled ? tipId : undefined}
      onClick={() => (disabled ? setTipOpen(true) : onSelect())}
      onMouseEnter={disabled ? () => setTipOpen(true) : undefined}
      onMouseLeave={disabled ? () => setTipOpen(false) : undefined}
      onFocus={disabled ? () => setTipOpen(true) : undefined}
      onBlur={disabled ? () => setTipOpen(false) : undefined}
      onKeyDown={disabled ? (e) => { if (e.key === "Escape") setTipOpen(false); } : undefined}
    >
      {segment.label}
      {disabled && (
        <span role="tooltip" id={tipId} className={"infotip-bubble seg-tip" + (tipOpen ? " is-open" : "")}>
          {segment.reason && asSentence(segment.reason)}
        </span>
      )}
    </button>
  );
}
