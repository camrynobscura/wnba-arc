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
  /** One-line plain-language explanation, shown in the stat's tooltip. A phrase: capitalized, no
      closing period — the tooltip adds it (InfoTip's `asSentence`: every tooltip ends with one, user
      2026-09-26) and `statDescBody` adds it for the sentence under the drill-down title. */
  desc: string;
}

export const STATS: StatDef[] = [
  { key: "pts", short: "PTS", label: "Points", pct: false, desc: "Points — how many the player scores per game" },
  { key: "reb", short: "REB", label: "Rebounds", pct: false, desc: "Rebounds — securing the ball after a miss, per game (offense + defense)" },
  { key: "ast", short: "AST", label: "Assists", pct: false, desc: "Assists — passes that lead directly to a teammate's basket, per game" },
  { key: "stl", short: "STL", label: "Steals", pct: false, desc: "Steals — taking the ball away from the offense, per game" },
  { key: "blk", short: "BLK", label: "Blocks", pct: false, desc: "Blocks — deflecting an opponent's shot attempt, per game" },
  { key: "fgp", short: "FG%", label: "Field Goal %", pct: true, desc: "Field goal % — how often the player's shots from the floor go in" },
  { key: "tpp", short: "3P%", label: "3-Point %", pct: true, desc: "Three-point % — how often the player's three-point attempts go in" },
  // Advanced (data already on the wire; see api.ts). Higher = better, and it has a
  // league baseline, so it fits the deviation model in both own/league modes.
  { key: "tsPct", short: "TS%", label: "True Shooting %", pct: true, desc: "True shooting % — overall scoring efficiency across twos, threes, and free throws" },
];

/**
 * A player's ESPN headshot for a photo `size` CSS px tall, best source first: ESPN's image resizer at the
 * size it's shown (3× for sharp phone screens), then the full 600×436 original in case the resizer fails.
 * The originals are ~280 KB each and were 5.5 MB on the landing page at 40px (Lighthouse, 2026-09-28).
 * The resizer (`combiner`) is what ESPN's own site uses; like the headshot path, it isn't documented. It
 * answers 404 for a missing headshot, as the original does, so the initials fallback still fires.
 * `scale=crop` crops rather than stretches a photo that isn't 600×436 (without it, a mismatched shape is
 * squashed — checked 2026-09-28).
 */
export function photoUrls(espnId: string, size: number): [resized: string, original: string] {
  const path = `/i/headshots/wnba/players/full/${espnId}.png`;
  const h = size * 3;
  const w = Math.round((h * 600) / 436);
  return [`https://a.espncdn.com/combiner/i?img=${path}&w=${w}&h=${h}&scale=crop`, `https://a.espncdn.com${path}`];
}

/** The description without its "Name — " lead-in, capitalized: what the drill-down shows under
    a heading that already says the name (the heatmap's header tooltips keep the full form, where
    the name is the context), closed with a period. "Points — how many the player scores per game" → "How many the player scores per
    game." */
export function statDescBody(desc: string): string {
  const body = desc.replace(/^[^—]+—\s*/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + (body.endsWith(".") ? "" : ".");
}
