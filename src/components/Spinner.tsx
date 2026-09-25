/**
 * Indeterminate loading indicator: three basketballs dribbling in sequence, drawn in ink
 * (outline + seams in currentColor). The motion — a gravity-shaped bounce, slow at the top and
 * fast at the floor — and the sizes live in theme.css (`.spinner`). Chosen 2026-09-25 from a
 * preview of seven basketball loaders (DECISIONS); it replaced the outlined "wave" of blocks that
 * echoed the long-gone deviation bars.
 *
 * Purely decorative (aria-hidden): the state text sitting next to it is what assistive tech
 * announces via the surrounding live region. Under prefers-reduced-motion the whole thing is
 * hidden (theme.css) and only the "Loading…" text remains — the user's call, 2026-09-25.
 *
 * The SVG is inlined three times rather than referenced through `<use>`: browsers put a `<use>`
 * clone in a shadow tree that stylesheet animations can't reach (measured 2026-09-25).
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
