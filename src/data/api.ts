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
  team: string | null; // null when the player is off a roster (waived, international duty, or retired)
  teamAbbr: string | null;
  pos: string | null; // null for most players from before 2012 — ESPN has no position on record
  jersey: number | null;
  active: boolean; // ESPN's "on a roster" flag — false when waived OR retired; it is NOT a retirement record
  firstYear: number | null; // first and last regular season on record — the career span
  lastYear: number | null;
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
  // Raw makes/attempts behind fgp/tpp. The frontend pools these into rate baselines
  // (SUM(made)/SUM(att)) instead of averaging season percentages, and gates seasons with
  // too few attempts — a % on a handful of shots is noise. See deviation.ts
  // (RATE_STAT_ATTEMPTS / MIN_RATE_ATTEMPTS). Always present (NOT NULL integers).
  fgMade: number;
  fgAtt: number;
  fg3Made: number;
  fg3Att: number;
  // Advanced (added to the displayed set). A decimal like the other percentage stats.
  tsPct: number | null; // true shooting %
  /** Qualified player-seasons in that year's league pool (the same set the averages and ladders come
      from); null if the year has no league row. Denominator for `rank` ("3rd of 141"). The pool is
      the players in the database: complete for the roster window, only still-active players before. */
  pool: number | null;
  /** This season's place in that pool per counting stat, 1 = best, ties share a rank; null when the
      season didn't qualify (small sample) or there's no pool. */
  rank: { pts: number; reb: number; ast: number; stl: number; blk: number } | null;
  /** The same two among the player's own POSITION that year — the crowd the /positions averages
      describe, gated the same way (a bucket needs 8 qualified players): where /positions has no
      (year, position) row, both are null. */
  posPool: number | null;
  posRank: { pts: number; reb: number; ast: number; stl: number; blk: number } | null;
}

export interface SeasonMissed {
  year: number;
  played: false;
  reason: string;
}

/** Dataset freshness — mirrors the API's `/meta`. */
export interface Meta {
  lastScrapedAt: string | null; // ISO 8601 UTC of the latest successful scrape; null if none
  /** "YYYY-MM-DD" of the latest completed regular-season game in the data — the footer's "Stats
      through …". Null until the API has recorded one (older API builds omit the field entirely). */
  statsThrough?: string | null;
}

/** Per-year league context — averages + real slate length. */
/** Spread ("step") travels only for the five COUNTING stats — the ones whose bars measure in
    league-steps. The shooting %s keep their relative-% bar, so they carry none. `null` on data from
    an API older than migration 004; the frontend then falls back to the relative-% bar. Mirror of
    the backend contract's StatSpread. (The API also sends value-at-decile ladders, `pctiles`; nothing
    here reads them since the percentile and the chart's band went — 2026-09-21.) */
export interface StatSpread {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
}
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
  stdev: StatSpread | null; // per-stat population spread — the deviation bar's step
}

/** Per-year, per-position averages — the "compare to same position" baseline. A (year,
 *  position) with too small a sample is simply absent from the array (the API omits it),
 *  which reads as "no same-position sample that season". Trimmed to the displayed stats,
 *  like LeagueSeason (the API also returns advanced/count fields we don't type here). */
export interface PositionSeason {
  year: number;
  position: string; // G / F / C
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgp: number;
  tpp: number;
  tsPct: number;
  stdev: StatSpread | null; // the position's own spread (bars measure vs this position's variation)
}

// ── fetch plumbing ───────────────────────────────────────────────────────────

/** Where the wnba-data read API lives. Set `VITE_API_BASE` at build time (e.g. in the
 *  Netlify env) to point at the deployed API. Unset (local dev) it falls back to the
 *  same-origin `/api` path, which the Vite dev server proxies to the API (vite.config.ts).
 *  A relative path means the browser never makes a cross-origin request in dev, so the app
 *  works from any device that can reach the dev server (a phone on the same wifi), not only
 *  from `localhost` on the machine running the API. `||` rather than `??` so an empty
 *  `VITE_API_BASE=` in a stray .env counts as unset instead of producing `""` + path. */
const BASE_URL = import.meta.env.VITE_API_BASE || "/api";

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

/** The select-screen list, alphabetical — everyone on record since 1997, retired players included.
 *  (The API's default scope is the rolling 3-season window, for a client that wants only current
 *  players; this app shows league history.) */
export function getPlayers(): Promise<PlayerSummary[]> {
  return fetchJson<PlayerSummary[]>("/players?scope=all");
}

/** One player with full history. */
export function getPlayer(id: string): Promise<PlayerDetail> {
  return fetchJson<PlayerDetail>(`/players/${id}`);
}

/** Per-year league averages + slate length. */
export function getLeague(): Promise<LeagueSeason[]> {
  return fetchJson<LeagueSeason[]>("/league");
}

/** Per-year, per-position averages (the same-position baseline). */
export function getPositions(): Promise<PositionSeason[]> {
  return fetchJson<PositionSeason[]>("/positions");
}

/** Dataset freshness (latest successful scrape time). */
export function getMeta(): Promise<Meta> {
  return fetchJson<Meta>("/meta");
}
