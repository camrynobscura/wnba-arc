/**
 * The frontend's view of the wnba-data read API. These types mirror the API contract
 * (wnba-data/src/api/contract.ts), trimmed to the fields this UI uses: the API's other advanced rates
 * are in the JSON but not typed here.
 */

import { apiBase, PLAYER_LIST_PATH } from "./apiUrls";

export interface PlayerSummary {
  id: string;
  espn: string;
  name: string;
  team: string | null; // null when the player is off a roster (waived, international duty, or retired)
  teamAbbr: string | null;
  pos: string | null; // null for most players from before 2009: ESPN has no position on record before 2012,
  // and the API fills 2009–2011 by hand
  jersey: number | null;
  active: boolean; // ESPN's "on a roster" flag: false when waived or retired, so not a retirement record
  firstYear: number | null; // first and last regular season on record: the career span
  lastYear: number | null;
  /** Names the player had before (a marriage, a corrected spelling), oldest first. Absent from an API
   *  older than the field. */
  formerNames?: string[];
}

export interface PlayerDetail extends PlayerSummary {
  seasons: Season[]; // ascending by year; gaps filled as SeasonMissed
}

export type Season = SeasonPlayed | SeasonMissed;

export interface SeasonPlayed {
  year: number;
  played: true;
  age: number | null; // null if birth date unknown
  gp: number;
  /** The games the player's team played that season (so far, in a season in progress): the Y in "17 of
      Y games" and what every games bar scales by. The last team, if traded; never less than gp. From
      wnba-data's team_season_games (migration 008). */
  teamGames: number;
  min: number | null; // minutes per game; null when not available
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgp: number | null; // decimal (0.466 = 46.6%); null on 0 attempts
  tpp: number | null;
  // The makes and attempts behind fgp/tpp. The frontend pools these (SUM(made) / SUM(att)) rather than
  // averaging season percentages, and doesn't color a season with too few attempts (deviation.ts
  // TINT_FLOOR). Always present.
  fgMade: number;
  fgAtt: number;
  fg3Made: number;
  fg3Att: number;
  /** Free throws and the season's total points: TS% pools from these (points ÷ 2(FGA + 0.44 × FTA)),
      and its tint floor counts TS attempts, FGA + 0.44 × FTA. */
  ftMade: number;
  ftAtt: number;
  ptsTotal: number;
  tsPct: number | null; // true shooting %, a decimal like fgp
  /** Qualified player-seasons in that year's league pool (everyone over the games bar, the same set the
      averages come from); null if the year has no league row. The denominator for a counting stat's
      `rank` ("3rd of 141"). */
  pool: number | null;
  /** This season's place per stat, 1 = best, ties share a rank; null when the season didn't qualify
      (too few games) or there's no pool. Inside a non-null `rank` the counting keys are always set; a
      shooting % is null when the season is under that stat's rank floor (see `ratePool`). */
  rank: SeasonRanks | null;
  /** The pool a shooting % ranks in: the qualified seasons that also cleared the API's rank floor for
      that stat (attempts or makes per 44 team games; deviation.ts RANK_FLOOR has the numbers) and its
      color floor, so a ranked season is always a colored one. Per stat, since each floor admits a
      different crowd ("4th of 70" for 3P% beside "16th of 122" for points). */
  ratePool: { fgp: number; tpp: number; tsPct: number } | null;
  /** The same among the player's position that year, gated the same way (a position group needs 8
      qualified players; without one, all three are null). A shooting %'s position pool is null, and its
      rank with it, when fewer than 8 at the position cleared the floor. */
  posPool: number | null;
  posRank: SeasonRanks | null;
  posRatePool: { fgp: number | null; tpp: number | null; tsPct: number | null } | null;
}

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

export interface Meta {
  lastScrapedAt: string | null; // ISO 8601 UTC of the latest successful scrape; null if none
  /** "YYYY-MM-DD" of the latest completed regular-season game in the data: the footer's "Stats
      through …". Null until the API has recorded one. */
  statsThrough?: string | null;
}

/** Standard deviations, sent only for the five counting stats (the shooting %s use a relative gap).
    Mirrors the contract's StatSpread. (The API also sends decile ladders, `pctiles`, which nothing here
    reads.) */
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
  tsPct: number;
  stdev: StatSpread | null; // null from an API older than migration 004: the colors then use the relative gap
}

/** Per-year, per-position averages. A (year, position) with too small a sample is absent (the API
 *  omits it). Trimmed to the displayed stats, like LeagueSeason. */
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
  stdev: StatSpread | null;
}

// ── fetch plumbing ───────────────────────────────────────────────────────────

/** Where the API lives; the rule is in apiUrls.ts, shared with the build's preload. */
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

/** The player list, alphabetical (PLAYER_LIST_PATH: everyone since 1997). index.html preloads this exact
 *  request (vite.config.ts), so on a cold load it's already on its way when this runs. */
export function getPlayers(): Promise<PlayerSummary[]> {
  return fetchJson<PlayerSummary[]>(PLAYER_LIST_PATH);
}

// Players already fetched this visit, by id: coming back to one (Back, a search) renders at once
// instead of refetching behind "Loading…". Kept for the whole visit, like the list and league data App
// loads once: the stats change at most daily. An in-flight request is shared, so a double effect
// (StrictMode) or a quick back-and-forth fetches once; a failure isn't remembered, so the next try
// refetches.
const playerCache = new Map<string, PlayerDetail>();
const playerRequests = new Map<string, Promise<PlayerDetail>>();

/** A player fetched earlier this visit, or null. Synchronous, so a return renders in one pass. */
export function cachedPlayer(id: string): PlayerDetail | null {
  return playerCache.get(id) ?? null;
}

export function getPlayer(id: string): Promise<PlayerDetail> {
  const hit = playerCache.get(id);
  if (hit) return Promise.resolve(hit);
  let request = playerRequests.get(id);
  if (!request) {
    request = fetchJson<PlayerDetail>(`/players/${encodeURIComponent(id)}`)
      .then((detail) => {
        playerCache.set(id, detail);
        return detail;
      })
      .finally(() => playerRequests.delete(id));
    playerRequests.set(id, request);
  }
  return request;
}

export function getLeague(): Promise<LeagueSeason[]> {
  return fetchJson<LeagueSeason[]>("/league");
}

export function getPositions(): Promise<PositionSeason[]> {
  return fetchJson<PositionSeason[]>("/positions");
}

export function getMeta(): Promise<Meta> {
  return fetchJson<Meta>("/meta");
}
