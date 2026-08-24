/**
 * Stat display metadata + the headshot-URL helper — the frontend-side constants
 * that describe *how* the 7 stats are shown. (These lived in src/data/players.ts,
 * which also held the old mock player + league data; that mock was retired once the
 * API wiring landed — real data now comes from the wnba-data API via src/data/api.ts.)
 */

export interface StatDef {
  key: "pts" | "reb" | "ast" | "stl" | "blk" | "fgp" | "tpp" | "tsPct";
  short: string;
  label: string;
  /** Whether the stat is a percentage (rendered as e.g. "43.2%") vs. a raw count. */
  pct: boolean;
}

export const STATS: StatDef[] = [
  { key: "pts", short: "PTS", label: "Points", pct: false },
  { key: "reb", short: "REB", label: "Rebounds", pct: false },
  { key: "ast", short: "AST", label: "Assists", pct: false },
  { key: "stl", short: "STL", label: "Steals", pct: false },
  { key: "blk", short: "BLK", label: "Blocks", pct: false },
  { key: "fgp", short: "FG%", label: "Field Goal %", pct: true },
  { key: "tpp", short: "3P%", label: "3-Point %", pct: true },
  // Advanced (data already on the wire; see api.ts). Higher = better, and it has a
  // league baseline, so it fits the deviation model in both own/league modes.
  { key: "tsPct", short: "TS%", label: "True Shooting %", pct: true },
];

/** ESPN headshot URL for a player, built from their espn id. */
export function photoUrl(espnId: string): string {
  return `https://a.espncdn.com/i/headshots/wnba/players/full/${espnId}.png`;
}
