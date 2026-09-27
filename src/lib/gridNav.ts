/**
 * Arrow-key movement in the heatmap's ARIA grid (roving tabindex) — pure, so the rules are tested
 * apart from the component. Rows 0…nRows−1 are the seasons; row −1 is the column-header row (the
 * stat names and their explanations), reached with ArrowUp from the top season: the whole grid is
 * ONE Tab stop, and the headers are part of it rather than eight more stops in front of it
 * (craftsmanship review 3.2, 2026-09-26). The year labels are not stops — they only name a row.
 */

/** A position in the grid. `r` −1 = the column-header row. */
export type GridCoord = { r: number; c: number };

/** Row index of the column-header row. */
export const HEADER_ROW = -1;

/** Where a key moves focus from `at`, or null when the key isn't a grid-movement key (the caller
 *  leaves those alone). Movement stops at the edges — no wrapping — as the grid pattern expects;
 *  Home / End go to the first / last column of the current row. */
export function gridMove(at: GridCoord, key: string, nRows: number, nCols: number): GridCoord | null {
  switch (key) {
    case "ArrowRight":
      return { r: at.r, c: Math.min(at.c + 1, nCols - 1) };
    case "ArrowLeft":
      return { r: at.r, c: Math.max(at.c - 1, 0) };
    case "ArrowDown":
      return { r: Math.min(at.r + 1, nRows - 1), c: at.c };
    case "ArrowUp":
      return { r: Math.max(at.r - 1, HEADER_ROW), c: at.c };
    case "Home":
      return { r: at.r, c: 0 };
    case "End":
      return { r: at.r, c: nCols - 1 };
    default:
      return null;
  }
}
