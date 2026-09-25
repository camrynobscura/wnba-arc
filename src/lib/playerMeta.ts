import type { PlayerSummary } from "../data/api";

/** "1997–2003", or "2004" for a one-season career; null when no regular season is on record. */
export function careerSpan(p: Pick<PlayerSummary, "firstYear" | "lastYear">): string | null {
  if (p.firstYear == null || p.lastYear == null) return null;
  return p.firstYear === p.lastYear ? String(p.firstYear) : `${p.firstYear}–${p.lastYear}`;
}

/**
 * The line under a player's name: what they are now, then only the parts we actually know —
 * never a separator with nothing on one side (the old fixed template printed " · · #" for a
 * player with no team, often no position, and no meaningful number).
 *   On a roster:  "Las Vegas Aces · C · #22" — a team-less active player (international duty,
 *                 say) just loses the team.
 *   Off a roster: "1997–2003 · G" — the career span stands in for the team, the position only
 *                 when ESPN has one (most players from before 2012 have none), no number (it's
 *                 her last, not hers).
 * The off-roster line does NOT say "Retired" (it did until 2026-09-25). `active` is ESPN's
 * "on a roster" flag, not a retirement record: 24 players with a 2026 season were already
 * inactive in September — Chennedy Carter, Teaira McCowan, Lexie Brown — waived, not retired.
 * The span says what we know ("played 2019 to 2026") without claiming why it ended.
 * `withJersey` is for the page header; search rows leave the number out.
 */
export function playerMeta(p: PlayerSummary, withJersey = false): string {
  const parts: (string | null)[] = p.active
    ? [p.team, p.pos, withJersey && p.jersey != null ? `#${p.jersey}` : null]
    : [careerSpan(p), p.pos];
  return parts.filter((s): s is string => Boolean(s)).join(" · ");
}
