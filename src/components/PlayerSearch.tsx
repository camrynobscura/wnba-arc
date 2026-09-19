import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PlayerSummary } from "../data/api";
import { Spinner } from "./Spinner";

/** Fold to a comparable form: strip diacritics, punctuation, and spaces (so "aja" matches "A'ja"). */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

interface PlayerSearchProps {
  /** Full roster from the API — null until it loads. */
  players: PlayerSummary[] | null;
  /** Set if the roster fetch failed; search is then unavailable. */
  listError: string | null;
  onPick: (espn: string) => void;
  /** "hero" = the big landing search box; "compact" = the quiet underline input on player pages. */
  variant?: "hero" | "compact";
}

const Magnifier = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

/**
 * Player/team autocomplete, shared by the landing hero and the compact in-row search on
 * player pages, so the folded matching lives in exactly one place. Implements the ARIA
 * combobox pattern: the input is the single tab stop, ↑/↓ move a highlight through the
 * results (wrapping), Enter opens the highlighted result (or the top match if none is
 * highlighted), Escape / an outside click closes the list. Mouse hover drives the same
 * highlight so keyboard and pointer stay in sync.
 */
export function PlayerSearch({ players, listError, onPick, variant = "hero" }: PlayerSearchProps) {
  const hero = variant === "hero";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false); // dropdown (results) visible
  const [highlight, setHighlight] = useState(-1); // active option index, -1 = none
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const filtered = useMemo(() => {
    const q = fold(query);
    if (!q || !players) return [];
    return players.filter((p) => fold(p.name).includes(q) || fold(p.team ?? "").includes(q));
  }, [players, query]);

  const q = fold(query);
  const showDrop = open && q.length > 0 && filtered.length > 0;
  const searchPending = q.length > 0 && players == null && !listError;
  const noMatches = q.length > 0 && players != null && filtered.length === 0;

  // Announced to screen readers as the search state changes (the dropdown is otherwise silent).
  const searchStatus = searchPending
    ? "Loading roster…"
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
  const listbox = (posStyle: React.CSSProperties) =>
    (showDrop || searchPending || noMatches) && (
      <div
        id={listId}
        role="listbox"
        aria-label="Player results"
        className="elev-md"
        style={{ position: "absolute", zIndex: 20, background: "var(--color-surface)", border: "1px solid var(--color-divider)", overflowY: "auto", ...posStyle }}
      >
        {searchPending ? (
          <div className="text-muted" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "var(--fs-sm)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Spinner /> Loading roster…
          </div>
        ) : noMatches ? (
          <div className="text-muted" style={{ padding: "var(--space-3) var(--space-4)", fontSize: "var(--fs-sm)" }}>No players match “{query}”.</div>
        ) : (
          filtered.map((p, i) => (
            <div
              key={p.espn}
              id={optionId(i)}
              role="option"
              aria-selected={i === highlight}
              className="btn btn-block"
              style={{
                justifyContent: "flex-start",
                border: 0,
                borderBottom: "1px solid var(--color-divider)",
                padding: "var(--space-3) var(--space-4)",
                gap: "var(--space-3)",
                marginTop: 0,
                cursor: "pointer",
                background: i === highlight ? "color-mix(in srgb, var(--color-neutral-900) 10%, transparent)" : undefined,
              }}
              // Keep focus on the input (so typing continues) while still registering the click.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(p.espn)}
            >
              {/* Name never wraps (flexShrink 0 + nowrap); if the row is still tight, the
                  secondary team/pos text truncates with an ellipsis instead. */}
              <span className="text-heading" style={{ fontSize: "var(--fs-base)", whiteSpace: "nowrap", flexShrink: 0 }}>{p.name}</span>
              <span
                className="text-muted"
                style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-xs)", marginLeft: "auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
              >
                {[p.team, p.pos].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))
        )}
      </div>
    );

  const srStatus = <p role="status" aria-live="polite" className="sr-only">{searchStatus}</p>;

  // ── Compact: a quiet, always-visible underline-only input on player pages ──
  if (!hero) {
    return (
      <div ref={rootRef} style={{ position: "relative", width: 200, maxWidth: "100%" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", color: "var(--color-neutral-600)", display: "flex", pointerEvents: "none" }}>
          <Magnifier size={15} />
        </span>
        <input
          {...comboProps}
          className="search-underline"
          style={{ width: "100%", height: 30, paddingLeft: "var(--space-6)", fontSize: "var(--fs-md)", color: "var(--color-text)", fontFamily: "var(--font-body)" }}
          placeholder={listError ? "Search unavailable" : players ? "Search players…" : "Loading roster…"}
          disabled={listError != null}
        />
        {/* Fixed width (not min/max content-sizing) so the box doesn't shrink as you type and
            the result set narrows — it stays locked at the max from the first keystroke. */}
        {listbox({ top: 36, right: 0, width: "min(340px, calc(100vw - 32px))", maxHeight: 300 })}
        {srStatus}
      </div>
    );
  }

  // ── Hero: the full landing search box ──
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
          placeholder={players ? "Search a player or team…" : "Loading roster for search…"}
        />
        {listbox({ left: 0, right: 0, top: 54, maxHeight: 360 })}
      </div>

      {srStatus}

      {searchPending && (
        <p className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Spinner /> Loading full roster…
        </p>
      )}
      {listError && (
        <p role="alert" className="text-muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--space-2)" }}>
          Couldn't load the full roster — search is unavailable, but featured players still work.
        </p>
      )}
    </>
  );
}
