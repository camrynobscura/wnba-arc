interface ScaleKeyProps {
  /** The reference the ends read against — `scaleNoun()`: "career avg", "league avg", "center avg". */
  noun: string;
}

/**
 * The diverging blue→base→red gradient key above the heatmap. The end labels
 * + arrows are the non-color cue for the encoding (WCAG 1.4.1). Width/placement are the
 * caller's job; this renders just the gradient bar and its two end labels.
 *
 * Hidden from screen readers, all of it: it is a key to the colors, which they don't get — each
 * cell's name already says the difference and against what ("+4.6 vs their career average").
 * Read out, it was one line of "below career avg above career avg" (a11y review P10, 2026-09-27).
 */
export function ScaleKey({ noun }: ScaleKeyProps) {
  return (
    <div aria-hidden="true">
      <div className="scale-grad" />
      {/* The arrows point along the gradient — decoration for the eye. */}
      <div className="scale-ends text-muted">
        <span>&larr; <b>below</b> {noun}</span>
        <span><b>above</b> {noun} &rarr;</span>
      </div>
    </div>
  );
}
