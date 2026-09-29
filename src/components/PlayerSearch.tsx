import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PlayerSummary } from "../data/api";
import { Spinner } from "./Spinner";
import { MetaLine } from "./MetaLine";
import { playerMeta } from "../lib/playerMeta";
import { fold, rankPlayers } from "../lib/search";
import { OFFLINE_HINT, RETRY_HINT, useOnline } from "../lib/loadFailure";

interface PlayerSearchProps {
  /** Every player from the API; null until it loads. */
  players: PlayerSummary[] | null;
  /** The roster fetch failed; search is then unavailable. */
  listFailed: boolean;
  onPick: (espn: string) => void;
  /** "hero": the big landing search box; "compact": the underline input on player pages. */
  variant?: "hero" | "compact";
}

const Magnifier = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

/**
 * Player and team search, on the landing page and at the top of player pages; the matching and ranking
 * live in lib/search.ts. The ARIA combobox pattern: the input is the one Tab stop, ↑/↓ move a highlight
 * through the results (wrapping), Enter opens the highlighted result (or the top match), and Escape or
 * an outside click closes the list. Hover moves the same highlight, so keyboard and pointer agree.
 */
export function PlayerSearch({ players, listFailed, onPick, variant = "hero" }: PlayerSearchProps) {
  const hero = variant === "hero";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false); // dropdown (results) visible
  const [highlight, setHighlight] = useState(-1); // active option index, -1 = none
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const online = useOnline(); // which line the landing's failure message says

  const filtered = useMemo(() => (players ? rankPlayers(players, query) : []), [players, query]);

  const q = fold(query);
  const showDrop = open && q.length > 0 && filtered.length > 0;
  const searchPending = q.length > 0 && players == null && !listFailed;
  const noMatches = q.length > 0 && players != null && filtered.length === 0;

  // Announced to screen readers as the search state changes.
  const searchStatus = searchPending
    ? "Loading players…"
    : showDrop
      ? `${filtered.length} ${filtered.length === 1 ? "result" : "results"}`
      : noMatches
        ? "No matching players"
        : "";

  const pick = (espn: string) => {
    onPick(espn);
    setQuery("");
    setOpen(false);
    setHighlight(-1);
  };

  // Close the dropdown on an outside click (the input itself stays put).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the highlighted option scrolled into view when navigating a long list by keyboard.
  useEffect(() => {
    if (highlight >= 0 && showDrop) {
      document.getElementById(optionId(highlight))?.scrollIntoView({ block: "nearest" });
    }
    // optionId is derived from a stable useId; only highlight/showDrop drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, showDrop]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // A type="search" field clears itself on Escape in some browsers; here Escape only closes the
      // results, as it always has, so the typed text survives.
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      if (!filtered.length) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      if (!filtered.length) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h <= 0 ? filtered.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      // Enter opens the highlighted result, or the top match if nothing is highlighted yet.
      const idx = highlight >= 0 ? highlight : 0;
      if (showDrop && filtered[idx]) {
        e.preventDefault();
        pick(filtered[idx].espn);
      }
    }
  };

  // Shared ARIA + handlers for the input, spread into either variant's <input>.
  const comboProps = {
    // type="search" keeps Safari's contact AutoFill off this box: it offered saved names over our
    // results, and a click meant for a player picked Apple's suggestion. autocomplete off stops
    // past-entry suggestions, and a phone keyboard shouldn't correct or capitalize a name mid-search.
    // theme.css resets the native search styling.
    type: "search" as const,
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    role: "combobox" as const,
    "aria-expanded": showDrop,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": showDrop && highlight >= 0 ? optionId(highlight) : undefined,
    "aria-label": "Search players or teams",
    value: query,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setOpen(true);
      setHighlight(-1);
    },
    onFocus: () => setOpen(true),
    onKeyDown,
  };

  // The results listbox (or a loading / no-match message), positioned by the caller.
  const listbox = (posStyle: React.CSSProperties) => {
    if (!(showDrop || searchPending || noMatches)) return null;
    const boxStyle: React.CSSProperties = { position: "absolute", zIndex: 20, background: "var(--color-surface)", border: "1px solid var(--color-divider)", overflowY: "auto", ...posStyle };
    // A message isn't a list: "Loading players…" or "No players match" is drawn in the same box but not
    // as a listbox, since one with no options is an ARIA error (axe's aria-required-children). The
    // status line below announces it.
    if (!showDrop) {
      return (
        <div className="elev-md" style={boxStyle}>
          {searchPending ? (
            <div className="text-muted" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "var(--fs-sm)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Spinner small /> Loading players…
            </div>
          ) : (
            <div className="text-muted" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "var(--fs-sm)" }}>No players match “{query}”.</div>
          )}
        </div>
      );
    }
    return (
      <div id={listId} role="listbox" aria-label="Player results" className="elev-md" style={boxStyle}>
        {filtered.map((p, i) => (
          <div
            key={p.espn}
            id={optionId(i)}
            role="option"
            aria-selected={i === highlight}
            className="search-option"
            // Keep focus on the input (so typing continues) while still registering the click.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => pick(p.espn)}
          >
            {/* The name never wraps; if the row is still tight, the team and position truncate. */}
            <span className="text-heading" style={{ fontSize: "var(--fs-base)", whiteSpace: "nowrap", flexShrink: 0 }}>{p.name}</span>
            <span
              className="text-muted"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-xs)", marginLeft: "auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
            >
              <MetaLine text={playerMeta(p)} />
            </span>
          </div>
        ))}
      </div>
    );
  };

  const srStatus = <p role="status" aria-live="polite" className="sr-only">{searchStatus}</p>;

  // ── Compact: the underline input on player pages ──
  if (!hero) {
    return (
      <div ref={rootRef} style={{ position: "relative", width: 200, maxWidth: "100%" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", color: "var(--color-neutral-600)", display: "flex", pointerEvents: "none" }}>
          <Magnifier size={15} />
        </span>
        <input
          {...comboProps}
          className="search-underline"
          // Font size lives in .search-underline (theme.css) so the touch-device rule there can win.
          style={{ width: "100%", height: 30, paddingLeft: "var(--space-6)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}
          // No "Loading players…" placeholder while the list loads: it flashed by too fast to read.
          // Someone who types before it arrives still gets the dropdown's message.
          placeholder={listFailed ? "Search unavailable" : "Search players…"}
          disabled={listFailed}
        />
        {/* A fixed width, so the box doesn't shrink as typing narrows the results. */}
        {listbox({ top: 36, right: 0, width: "min(340px, calc(100vw - 32px))", maxHeight: 300 })}
        {srStatus}
      </div>
    );
  }

  // ── Hero: the landing page's search box ──
  return (
    <>
      <div ref={rootRef} style={{ position: "relative" }}>
        <div aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-neutral-600)", display: "flex" }}>
          <Magnifier size={18} />
        </div>
        <input
          {...comboProps}
          className="input"
          style={{ paddingLeft: "var(--space-10)", height: 48, fontSize: "var(--fs-base)" }}
          // As in the compact box: no loading placeholder, and "Search unavailable" if the list failed.
          placeholder={listFailed ? "Search unavailable" : "Search players or teams…"}
        />
        {listbox({ left: 0, right: 0, top: 54, maxHeight: 360 })}
      </div>

      {srStatus}

      {listFailed && (
        <p role="alert" className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-2)" }}>
          {online ? `Couldn't load the player list. ${RETRY_HINT}` : OFFLINE_HINT}
        </p>
      )}
    </>
  );
}
