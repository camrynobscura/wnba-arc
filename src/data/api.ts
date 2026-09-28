/**
 * The frontend's view of the wnba-data read API.
 *
 * These types MIRROR the API contract (wnba-data/src/api/contract.ts), but trimmed
 * to only the fields this UI actually uses. The API also returns ~10 advanced/role
 * stats per season (tsPct, usgPct, …); they ride along in the JSON but we don't
 * type them here because nothing reads them yet. Widen these types if an advanced
 * section is ever built — the data is already on the wire.
 */

import { apiBase, PLAYER_LIST_PATH } from "./apiUrls";

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
  /** The games the player's team played that season (so far, in the season in progress) — the Y in
      "17 of Y games" and what every games bar scales by. The last team they played for, if traded;
      never less than gp. From wnba-data's team_season_games (migration 008). */
  teamGames: number;
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
  /** Free throws and the season's total points — TS% pools from these (points ÷ 2·(FGA + 0.44·FTA))
      and its tint floor counts "shooting possessions", FGA + 0.44·FTA. */
  ftMade: number;
  ftAtt: number;
  ptsTotal: number;
  // Advanced (added to the displayed set). A decimal like the other percentage stats.
  tsPct: number | null; // true shooting %
  /** Qualified player-seasons in that year's league pool (the same set the averages and ladders come
      from — everyone over the games gate); null if the year has no league row. Denominator for a
      counting stat's `rank` ("3rd of 141"). */
  pool: number | null;
  /** This season's place per stat, 1 = best, ties share a rank; null when the season didn't qualify
      (too few games) or there's no pool. Inside a non-null `rank` the counting keys are always set; a
      shooting % is null when the season is under that stat's rank floor (see `ratePool`). */
  rank: SeasonRanks | null;
  /** The pool a shooting % ranks in: the qualified seasons that also cleared the API's rank floor
      for that stat (attempts OR makes per 44 games, scaled to the year's schedule: 3P% 60 att or 20
      made, FG% 200 att or 85 made, TS% 125 shooting possessions — deviation.ts RANK_FLOOR mirrors the
      numbers) AND its color floor (so a ranked season is always a colored one). Per stat, because
      each floor admits a different crowd ("4th of 70" for 3P% beside "16th of 122" for points). */
  ratePool: { fgp: number; tpp: number; tsPct: number } | null;
  /** The same among the player's own POSITION that year — the crowd the /positions averages
      describe, gated the same way (a bucket needs 8 qualified players): where /positions has no
      (year, position) row, all are null. A shooting %'s position pool is null (and its rank with it)
      when fewer than 8 of the position cleared the floor that year. */
  posPool: number | null;
  posRank: SeasonRanks | null;
  posRatePool: { fgp: number | null; tpp: number | null; tsPct: number | null } | null;
}

/** A season's place per stat, 1 = best. Mirrors the API's SeasonRanks. */
export interface SeasonRanks {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgp: number | null;
  tpp: number | null;
  tsPct: number | null;
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
  scheduledGames: number; // the season total (one team's count); the page reads SeasonPlayed.teamGames instead
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

/** Where the wnba-data read API lives — the rule is in apiUrls.ts, shared with the build's preload. */
const BASE_URL = apiBase(import.meta.env.VITE_API_BASE);

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

/** The select-screen list, alphabetical (PLAYER_LIST_PATH: everyone since 1997). index.html preloads this
 *  exact request (vite.config.ts), so on a cold load it's already on its way when this runs. */
export function getPlayers(): Promise<PlayerSummary[]> {
  return fetchJson<PlayerSummary[]>(PLAYER_LIST_PATH);
}

// Players already fetched this visit, by DB id: coming back to one — About's Back, the browser's
// Back/Forward, a search — renders at once instead of refetching behind "Loading…" (user,
// 2026-09-26). Kept for the whole visit, like the roster and league data App loads once: the stats
// change at most nightly. An in-flight request is shared, so a double effect (StrictMode) or a
// quick back-and-forth fetches once; a failure isn't remembered, so the next visit retries.
const playerCache = new Map<string, PlayerDetail>();
const playerRequests = new Map<string, Promise<PlayerDetail>>();

/** A player fetched earlier this visit, or null. Synchronous, so a return renders in one pass. */
export function cachedPlayer(id: string): PlayerDetail | null {
  return playerCache.get(id) ?? null;
}

/** One player with full history — from memory when already fetched this visit. */
export function getPlayer(id: string): Promise<PlayerDetail> {
  const hit = playerCache.get(id);
  if (hit) return Promise.resolve(hit);
  let request = playerRequests.get(id);
  if (!request) {
    request = fetchJson<PlayerDetail>(`/players/${id}`)
      .then((detail) => {
        playerCache.set(id, detail);
        return detail;
      })
      .finally(() => playerRequests.delete(id));
    playerRequests.set(id, request);
  }
  return request;
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
