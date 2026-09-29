import type { PlayerSummary } from "../data/api";
import { positionName } from "./deviation";

/**
 * A player's line both ways: `shown` as drawn ("Las Vegas Aces · C · #22"), `spoken` as a screen reader should say it
 * ("Las Vegas Aces, center, #22"). Read aloud, a lone "C" is unclear (it sounds like "see"), and VoiceOver says
 * nothing for the "·", so the parts ran together. The spoken line uses the position's word and commas
 * (screen-reader review, user 2026-09-29). `MetaLine` draws the one and speaks the other.
 */
export interface MetaText {
  shown: string;
  spoken: string;
}

/** A part of the line: the same text both ways, its own pair, or nothing (left out, with its separator). */
export type MetaPart = string | MetaText | null;

/** The position as a part: the code on screen, its word when spoken (an unknown code is spoken as written). */
export function positionPart(pos: string | null): MetaText | null {
  return pos ? { shown: pos, spoken: positionName(pos) ?? pos } : null;
}

/** Joins the parts that exist: " · " between them on screen, ", " when spoken. */
export function joinMeta(parts: MetaPart[]): MetaText {
  const kept = parts.filter((p): p is string | MetaText => Boolean(p));
  return {
    shown: kept.map((p) => (typeof p === "string" ? p : p.shown)).join(" · "),
    spoken: kept.map((p) => (typeof p === "string" ? p : p.spoken)).join(", "),
  };
}

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
 *                 their last, not theirs).
 * The off-roster line does NOT say "Retired" (it did until 2026-09-25). `active` is ESPN's
 * "on a roster" flag, not a retirement record: 24 players with a 2026 season were already
 * inactive in September — Chennedy Carter, Teaira McCowan, Lexie Brown — waived, not retired.
 * The span says what we know ("played 2019 to 2026") without claiming why it ended.
 * `withJersey` is for the page header; search rows leave the number out.
 */
export function playerMeta(p: PlayerSummary, withJersey = false): MetaText {
  return joinMeta(
    p.active
      ? [p.team, positionPart(p.pos), withJersey && p.jersey != null ? `#${p.jersey}` : null]
      : [careerSpan(p), positionPart(p.pos)],
  );
}
