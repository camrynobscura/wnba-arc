/**
 * The API's address rule and the player list's path — shared by the app (api.ts) and the build
 * (vite.config.ts, which puts a preload for the list into index.html). One definition, so the preload
 * always names exactly the request the app makes; a mismatch would download the list twice.
 * Plain TypeScript, no browser or Vite globals: the build config imports it too.
 */

/** The full player list: everyone on record since 1997, retired players included. (The API's default
 *  scope is the rolling 3-season window, for a client that wants only current players; this app
 *  shows league history.) */
export const PLAYER_LIST_PATH = "/players?scope=all";

/** Where the wnba-data read API lives, from `VITE_API_BASE`. Set it at build time (e.g. in the Netlify
 *  env) to point at the deployed API. Unset (local dev) it falls back to the same-origin `/api` path,
 *  which the Vite dev server proxies to the API (vite.config.ts). A relative path means the browser
 *  never makes a cross-origin request in dev, so the app works from any device that can reach the dev
 *  server (a phone on the same wifi), not only from `localhost` on the machine running the API. `||`
 *  rather than `??` so an empty `VITE_API_BASE=` in a stray .env counts as unset instead of producing
 *  `""` + path. */
export function apiBase(configured: string | undefined): string {
  return configured || "/api";
}
