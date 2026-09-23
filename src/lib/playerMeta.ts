import type { PlayerSummary } from "../data/api";

/** "1997–2003", or "2004" for a one-season career; null when no regular season is on record. */
export function careerSpan(p: Pick<PlayerSummary, "firstYear" | "lastYear">): string | null {
  if (p.firstYear == null || p.lastYear == null) return null;
  return p.firstYear === p.lastYear ? String(p.firstYear) : `${p.firstYear}–${p.lastYear}`;
}

/**
 * The line under a player's name: what they are now, then only the parts we actually know —
 * never a separator with nothing on one side (the old fixed template printed " · · #" for a
 * retired player, who has no team, often no position, and no meaningful number).
 *   Active:  "Las Vegas Aces · C · #22" — a team-less active player (international duty, say)
 *            just loses the team.
 *   Retired: "Retired · 1997–2003 · G" — the career span stands in for the team, the position
 *            only when ESPN has one (most players from before 2012 have none).
 * `withJersey` is for the page header; search rows leave the number out.
 */
export function playerMeta(p: PlayerSummary, withJersey = false): string {
  const parts: (string | null)[] = p.active
    ? [p.team, p.pos, withJersey && p.jersey != null ? `#${p.jersey}` : null]
    : ["Retired", careerSpan(p), p.pos];
  return parts.filter((s): s is string => Boolean(s)).join(" · ");
}
