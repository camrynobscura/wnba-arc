import type { CSSProperties } from "react";

interface DeviationBlocksProps {
  /** True when the value is above baseline (fills right, accent); false fills left (grey). */
  up: boolean;
  /** Bar length as a percent of the row's half-width (0–50), from buildRows. */
  barPct: number;
  /** Fill color for the lit blocks (accent above / neutral below). */
  barColor: string;
  /** Show the "baseline" caption above the centre line (only the topmost row). */
  showBaselineLabel?: boolean;
}

/** Blocks per side of the baseline. Raise for thinner blocks. */
const N = 8;

/**
 * Segmented "video-game" deviation bar: discrete blocks fill outward from a central
 * baseline — right/accent for above, left/grey for below. The block *count* is a second
 * cue on top of color; the last lit block partial-fills so exact magnitude is preserved.
 * Mirrors mockups/segmented-bars.html variant 01.
 */
export function DeviationBlocks({ up, barPct, barColor, showBaselineLabel }: DeviationBlocksProps) {
  const mag = Math.min(barPct / 50, 1) * N; // number of lit blocks (fractional)
  return (
    <div className="dev-blocks">
      <div className="dev-cells">
        <Half side="left" mag={mag} active={!up && barPct > 0} color={barColor} />
        <Half side="right" mag={mag} active={up && barPct > 0} color={barColor} />
      </div>
      <div className="dev-rail" aria-hidden="true">
        {showBaselineLabel && <span className="dev-rail-label">baseline</span>}
      </div>
    </div>
  );
}

function Half({ side, mag, active, color }: { side: "left" | "right"; mag: number; active: boolean; color: string }) {
  return (
    <div className={"dev-half" + (side === "left" ? " left" : "")}>
      {Array.from({ length: N }, (_, i) => {
        // distance from the baseline: 1 = nearest the centre, N = furthest out
        const dist = side === "left" ? N - i : i + 1;
        const amt = active ? Math.max(0, Math.min(1, mag - (dist - 1))) : 0; // fill fraction of this block
        let fill: CSSProperties | undefined;
        if (amt > 0) {
          const dir = side === "left" ? "to left" : "to right";
          fill =
            amt >= 1
              ? { background: color }
              : { background: `linear-gradient(${dir}, ${color} ${amt * 100}%, transparent ${amt * 100}%)` };
        }
        return (
          <div key={i} className="dev-cell">
            {fill && <div className="dev-fill" style={fill} />}
          </div>
        );
      })}
    </div>
  );
}
