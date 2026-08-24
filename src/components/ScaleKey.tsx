interface ScaleKeyProps {
  /** The comparison noun the ends read against — e.g. "average" or "baseline". */
  noun: string;
}

/**
 * The diverging blue→base→red gradient key, shared by the Career Trend heatmap and the
 * Season Breakdown bars so both views explain the same scale identically. The end labels
 * + arrows are the non-color cue for the encoding (WCAG 1.4.1). Width/placement are the
 * caller's job; this renders just the gradient bar and its two end labels.
 */
export function ScaleKey({ noun }: ScaleKeyProps) {
  return (
    <div>
      <div className="scale-grad" aria-hidden="true" />
      <div className="scale-ends text-muted">
        <span>&larr; <b>below</b> {noun}</span>
        <span><b>above</b> {noun} &rarr;</span>
      </div>
    </div>
  );
}
