import { useEffect, useMemo, useRef, useState } from "react";
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
  /** "hero" = the big landing search box; "compact" = a quiet underlined trigger on player pages. */
  variant?: "hero" | "compact";
}

const Magnifier = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

/**
 * Player/team autocomplete. Shared by the landing hero and the compact in-row search on
 * player pages, so the folded matching lives in exactly one place. The hero is a full input
 * box; the compact variant is a quiet underlined "Search players" trigger that expands into
 * an underline-only input on click. Closes on Escape / outside click / empty blur; picking
 * clears and collapses.
 */
export function PlayerSearch({ players, listError, onPick, variant = "hero" }: PlayerSearchProps) {
  const hero = variant === "hero";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false); // dropdown (results) visible
  const rootRef = useRef<HTMLDivElement>(null);

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

  const resultButtons = filtered.map((p) => (
    <button
      key={p.espn}
      className="btn btn-block"
      style={{
        justifyContent: "flex-start",
        border: 0,
        borderBottom: "1px solid var(--color-divider)",
        padding: "12px 14px",
        gap: 12,
        marginTop: 0,
      }}
      onClick={() => pick(p.espn)}
    >
      <span className="text-heading" style={{ fontSize: 15 }}>{p.name}</span>
      <span className="text-muted" style={{ fontFamily: "var(--font-body)", fontSize: 12, marginLeft: "auto" }}>
        {[p.team, p.pos].filter(Boolean).join(" · ")}
      </span>
    </button>
  ));

  const srStatus = <p role="status" aria-live="polite" className="sr-only">{searchStatus}</p>;

  // ── Compact: a quiet, always-visible underline-only input on player pages ──
  if (!hero) {
    return (
      <div ref={rootRef} style={{ position: "relative", width: 200, maxWidth: "100%" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", color: "var(--color-neutral-600)", display: "flex", pointerEvents: "none" }}>
          <Magnifier size={15} />
        </span>
        <input
          className="search-underline"
          aria-label="Search players or teams"
          style={{ width: "100%", height: 30, paddingLeft: 24, fontSize: 14, color: "var(--color-text)", fontFamily: "var(--font-body)" }}
          placeholder={listError ? "Search unavailable" : players ? "Search players…" : "Loading roster…"}
          disabled={listError != null}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {(showDrop || searchPending || noMatches) && (
          <div className="elev-md" style={{ position: "absolute", top: 36, right: 0, zIndex: 20, background: "var(--color-surface)", border: "1px solid var(--color-divider)", minWidth: 260, maxWidth: "min(320px, calc(100vw - 32px))", maxHeight: 300, overflowY: "auto" }}>
            {searchPending ? (
              <div className="text-muted" style={{ padding: "12px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner /> Loading roster…
              </div>
            ) : noMatches ? (
              <div className="text-muted" style={{ padding: "12px 14px", fontSize: 13 }}>No players match “{query}”.</div>
            ) : (
              resultButtons
            )}
          </div>
        )}
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
          className="input"
          aria-label="Search players or teams"
          style={{ paddingLeft: 38, height: 48, fontSize: 16 }}
          placeholder={players ? "Search a player or team…" : "Loading roster for search…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {showDrop && (
          <div className="elev-md" style={{ position: "absolute", left: 0, right: 0, top: 54, zIndex: 10, background: "var(--color-surface)", border: "1px solid var(--color-divider)", maxHeight: 360, overflowY: "auto" }}>
            {resultButtons}
          </div>
        )}
      </div>

      {srStatus}

      {searchPending && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Spinner /> Loading full roster…
        </p>
      )}
      {listError && (
        <p role="alert" className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Couldn't load the full roster — search is unavailable, but featured players still work.
        </p>
      )}
    </>
  );
}
