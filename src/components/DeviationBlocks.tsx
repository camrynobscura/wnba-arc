import type { CSSProperties } from "react";

interface DeviationBlocksProps {
  /** True when the value is above baseline (fills right, accent); false fills left (grey). */
  up: boolean;
  /** Bar length as a percent of the row's half-width (0–50), from buildRows. */
  barPct: number;
  /** Fill color for the lit blocks (accent above / neutral below). */
  barColor: string;
}

/** Blocks per side of the baseline. Raise for thinner blocks. */
const N = 8;

/**
 * Color intensity (% opacity of the hue) of the block nearest the baseline. Blocks ramp
 * from this up to 100% at the tip, so the bar gradates like the heatmap — pale near the
 * centre line, full hue furthest out. Fades toward transparent (not --hm-base like the
 * heatmap) so each block's own outline stays visible at low intensity.
 */
const CENTER_MIN = 45;

/**
 * Segmented "video-game" deviation bar: discrete blocks fill outward from a central
 * baseline — right/accent for above, left/grey for below. The block *count* is a second
 * cue on top of color; the last lit block partial-fills so exact magnitude is preserved.
 * Mirrors mockups/segmented-bars.html variant 01.
 */
export function DeviationBlocks({ up, barPct, barColor }: DeviationBlocksProps) {
  const mag = Math.min(barPct / 50, 1) * N; // number of lit blocks (fractional)
  return (
    <div className="dev-blocks">
      <div className="dev-cells">
        <Half side="left" mag={mag} active={!up && barPct > 0} color={barColor} />
        <Half side="right" mag={mag} active={up && barPct > 0} color={barColor} />
      </div>
      {/* Centre tick marking the zero line (= the league/position average). The ScaleKey above
          names it; the per-stat number lives under each stat label. */}
      <div className="dev-rail" aria-hidden="true" />
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
          // Ramp the hue's intensity with distance from the baseline (pale centre → full tip).
          const pct = CENTER_MIN + ((dist - 1) / (N - 1)) * (100 - CENTER_MIN);
          const c = `color-mix(in srgb, ${color} ${pct}%, transparent)`;
          const dir = side === "left" ? "to left" : "to right";
          fill =
            amt >= 1
              ? { background: c }
              : { background: `linear-gradient(${dir}, ${c} ${amt * 100}%, transparent ${amt * 100}%)` };
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
