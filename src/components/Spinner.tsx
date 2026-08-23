/**
 * Indeterminate loading indicator: a wave of accent fill traveling across small
 * hairline blocks — the same segmented-block language as the deviation bars, so
 * loading feels like part of the app rather than a bolted-on circular spinner.
 *
 * Purely decorative (aria-hidden): the state text sitting next to it is what
 * assistive tech announces via the surrounding live region. Under
 * prefers-reduced-motion the wave stops and the blocks hold a static half-fill
 * (see .spinner in theme.css), so there's still a visible "in progress" glyph.
 */
export function Spinner() {
  return (
    <span className="spinner" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
