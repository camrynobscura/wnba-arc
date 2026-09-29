interface ScaleKeyProps {
  /** The reference the ends read against (`scaleNoun()`): "career avg", "league avg", "center avg". */
  noun: string;
}

/**
 * The blue-to-red color key above the heatmap. The end labels and arrows are the cue that doesn't rely on
 * color (WCAG 1.4.1). Width and placement are the caller's job.
 *
 * Hidden from screen readers: it's a key to the colors, and each cell's spoken text already says the
 * difference and against what ("+4.6 vs their career average").
 */
export function ScaleKey({ noun }: ScaleKeyProps) {
  return (
    <div aria-hidden="true">
      <div className="scale-grad" />
      {/* The arrows point along the gradient: decoration. */}
      <div className="scale-ends text-muted">
        <span>
          &larr; <b>below</b> {noun}
        </span>
        <span>
          <b>above</b> {noun} &rarr;
        </span>
      </div>
    </div>
  );
}
