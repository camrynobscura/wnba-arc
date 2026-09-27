import { useEffect, type RefObject } from "react";
import { useLocation } from "react-router-dom";

/** The site's name, as the browser tab shows it (user, 2026-09-27: "WNBA Arc", not caps). */
export const SITE_NAME = "WNBA Arc";

/** "A'ja Wilson — WNBA Arc": a page's tab title. */
export const pageTitle = (page: string) => `${page} — ${SITE_NAME}`;

/** Sets the browser tab's title for the page on screen. Until 2026-09-27 every page kept the landing
 *  page's title, so tabs, history, bookmarks and a screen reader's page announcement couldn't tell
 *  pages apart (WCAG 2.4.2 — a11y review O1). */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

// What had focus when the page changed, while a new page's heading is still to take it; `false` when
// nothing is pending. Set by App's ScrollManager, taken by the first page heading to render after it.
let pending: Element | null | false = false;

/** A new page is on screen (not the first page, not a stat / comparison change on the same player): its
 *  main heading is to take focus. Until 2026-09-27 focus fell to <body> — or stayed in the top-row
 *  search — and a screen reader wasn't told a new page had arrived (a11y review O2). */
export function markPageChange() {
  pending = document.activeElement;
}

/**
 * Focus a page's main heading when the page arrives by a page change — `ref` is the heading, which needs
 * tabIndex −1 and draws no ring (`.page-heading`, theme.css; user, 2026-09-27: a heading isn't a
 * control — focus there only marks where reading and the next Tab start). `enabled` false for a heading
 * that isn't the page's final one: a "Loading…" notice is replaced as soon as the player arrives, and
 * the focus would fall to <body> with it. Runs on every location change, not only on mount: switching
 * between two players already fetched keeps the same heading element. `preventScroll`: the scroll
 * position is ScrollManager's (the top, or the restored one on Back).
 */
export function useArrivalFocus(ref: RefObject<HTMLElement | null>, enabled = true) {
  const { key } = useLocation();
  useEffect(() => {
    if (!enabled || pending === false) return;
    const focusedThen = pending;
    pending = false;
    // The reader has moved on since the page changed (e.g. clicked into the search while a player was
    // loading): leave their focus where it is.
    const now = document.activeElement;
    if (now && now !== document.body && now !== focusedThen) return;
    ref.current?.focus({ preventScroll: true });
  }, [key, enabled, ref]);
}
