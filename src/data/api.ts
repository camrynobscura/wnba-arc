/**
 * The frontend's view of the wnba-data read API.
 *
 * These types MIRROR the API contract (wnba-data/src/api/contract.ts), but trimmed
 * to only the fields this UI actually uses. The API also returns ~10 advanced/role
 * stats per season (tsPct, usgPct, …); they ride along in the JSON but we don't
 * type them here because nothing reads them yet. Widen these types if an advanced
 * section is ever built — the data is already on the wire.
 */

/** A row in the select-screen list. */
export interface PlayerSummary {
  id: string;
  espn: string;
  name: string;
  team: string | null; // null when the player is off-roster (e.g. intl duty)
  teamAbbr: string | null;
  pos: string | null;
  jersey: number | null;
}

/** One player with full regular-season history. */
export interface PlayerDetail extends PlayerSummary {
  seasons: Season[]; // ascending by year; gaps filled as SeasonMissed
}

export type Season = SeasonPlayed | SeasonMissed;

export interface SeasonPlayed {
  year: number;
  played: true;
  age: number | null; // null if birth date unknown
  gp: number;
  min: number | null; // per-game minutes; null when not available (~10%)
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgp: number | null; // decimal (0.466 = 46.6%); null on 0 attempts
  tpp: number | null;
  // Advanced (added to the displayed set). A decimal like the other percentage stats.
  tsPct: number | null; // true shooting %
}

export interface SeasonMissed {
  year: number;
  played: false;
  reason: string;
}

/** Dataset freshness — mirrors the API's `/meta`. */
export interface Meta {
  lastScrapedAt: string | null; // ISO 8601 UTC of the latest successful scrape; null if none
}

/** Per-year league context — averages + real slate length. */
export interface LeagueSeason {
  year: number;
  scheduledGames: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgp: number;
  tpp: number;
  tsPct: number; // league TS% — the baseline for the displayed TS%
}

// ── fetch plumbing ───────────────────────────────────────────────────────────

/** Where the wnba-data read API lives. Set `VITE_API_BASE` at build time (e.g. in the
 *  Netlify env) to point at the deployed API; falls back to the local dev server. */
const BASE_URL = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

/**
 * GET a path from the API and parse the JSON body, typed as T.
 * Throws on a network failure or any non-2xx response, so callers can rely on a
 * resolved promise meaning "we have data" and a rejected one meaning "show an error".
 */
async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── endpoints ────────────────────────────────────────────────────────────────

/** The select-screen list, alphabetical. */
export function getPlayers(): Promise<PlayerSummary[]> {
  return fetchJson<PlayerSummary[]>("/players");
}

/** One player with full history. */
export function getPlayer(id: string): Promise<PlayerDetail> {
  return fetchJson<PlayerDetail>(`/players/${id}`);
}

/** Per-year league averages + slate length. */
export function getLeague(): Promise<LeagueSeason[]> {
  return fetchJson<LeagueSeason[]>("/league");
}

/** Dataset freshness (latest successful scrape time). */
export function getMeta(): Promise<Meta> {
  return fetchJson<Meta>("/meta");
}
