/**
 * The loading indicator: three basketballs dribbling in sequence, drawn in ink (outline and seams in
 * currentColor). The motion and sizes live in theme.css (`.spinner`). Decorative (aria-hidden): the text
 * beside it is what the surrounding live region announces. Under prefers-reduced-motion it's hidden and only
 * the "Loading…" text remains.
 *
 * The SVG is inlined three times rather than referenced through `<use>`: browsers put a `<use>` clone in a
 * shadow tree that stylesheet animations can't reach.
 */
export function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span className={"spinner" + (small ? " spinner-sm" : "")} aria-hidden="true">
      <Ball />
      <Ball />
      <Ball />
    </span>
  );
}

function Ball() {
  return (
    <svg viewBox="0 0 24 24">
      <circle className="ball-outline" cx="12" cy="12" r="10.2" />
      <path className="ball-seam" d="M12 1.8V22.2M1.8 12h20.4" />
      <path className="ball-seam" d="M4.8 4.8C9 8.6 9 15.4 4.8 19.2M19.2 4.8C15 8.6 15 15.4 19.2 19.2" />
    </svg>
  );
}
