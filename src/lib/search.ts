import type { PlayerSummary } from "../data/api";

/**
 * Player search: matching and ranking. Each typed word is its own check, and a player matches only when
 * every word matches:
 *   - the start of a word of their name ("sab" → Sabrina, Sabally; "io" → Ionescu), or
 *   - the start of a word of their team ("sun" → Connecticut Sun), or
 *   - letters inside a name word: the weak match, kept so an accent-stripped fragment still finds
 *     someone, but ranked last.
 * Word order doesn't matter ("ionescu sab" = "sab ionescu"). Folding strips accents, apostrophes and
 * punctuation, so "aja" matches "A'ja".
 */

/** A name or team, folded to lowercase letters/digits, split into its words. */
export function foldWords(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/['’‘]/g, "") // apostrophes vanish: "A'ja" is one word, "aja"
    .toLowerCase()
    .split(/[^a-z0-9]+/) // spaces, hyphens, dots split words
    .filter(Boolean);
}

/** Fold to a comparable form with no separators at all ("A'ja Wilson" → "ajawilson"). */
export function fold(s: string): string {
  return foldWords(s).join("");
}

/** How well one typed word matches a player. Lower is better; null = no match. */
type WordMatch = 0 | 1 | 2;

function matchWord(word: string, nameWords: string[], teamWords: string[]): WordMatch | null {
  if (nameWords.some((w) => w.startsWith(word))) return 0;
  if (teamWords.some((w) => w.startsWith(word))) return 1;
  // Mid-word, or a run of letters across a word boundary ("sab" in "alisaburras"): kept for the accent
  // and apostrophe cases; the boundary case rides along and ranks last.
  if (nameWords.some((w) => w.includes(word)) || nameWords.join("").includes(word)) return 2;
  return null;
}

/**
 * The ranking tier for a player, or null when some typed word matches nothing:
 *   0 — every word starts a name word;
 *   1 — every word starts a name or team word, at least one via the team;
 *   2 — at least one word matched only inside a word.
 */
export function matchTier(p: Pick<PlayerSummary, "name" | "team">, queryWords: string[]): 0 | 1 | 2 | null {
  const nameWords = foldWords(p.name);
  const teamWords = p.team ? foldWords(p.team) : [];
  let worst: WordMatch = 0;
  for (const w of queryWords) {
    const m = matchWord(w, nameWords, teamWords);
    if (m == null) return null;
    if (m > worst) worst = m;
  }
  return worst;
}

/** True when a typed word starts the player's first name ("sab" → Sabrina Ionescu, not Nyara Sabally). */
function firstNameHit(p: Pick<PlayerSummary, "name">, queryWords: string[]): boolean {
  const first = foldWords(p.name)[0];
  return first != null && queryWords.some((w) => first.startsWith(w));
}

type Searchable = Pick<PlayerSummary, "name" | "team" | "formerNames">;

/**
 * The former name a query finds the player by, when their current name doesn't match it: "coffey" finds
 * Nia Brodie, and the result says "formerly Nia Coffey" so the match makes sense. Null when the current
 * name matches, or nothing does.
 */
export function formerNameMatch(p: Searchable, queryWords: string[]): string | null {
  if (queryWords.length === 0 || matchTier(p, queryWords) != null) return null;
  return p.formerNames?.find((name) => matchTier({ name, team: p.team }, queryWords) != null) ?? null;
}

/** The player's tier by their current name, else by the former name the query found. */
function bestTier(p: Searchable, queryWords: string[]): 0 | 1 | 2 | null {
  const tier = matchTier(p, queryWords);
  if (tier != null) return tier;
  const former = formerNameMatch(p, queryWords);
  return former == null ? null : matchTier({ name: former, team: p.team }, queryWords);
}

/**
 * Filter and rank the player list for a query. Tier first; within a tier, players from the latest season
 * on record ("current": the latest `lastYear` in the list, so it rolls forward each season and a player
 * waived mid-season still counts); then first-name matches, since most people search by first name ("sab"
 * puts Sabrina Ionescu above Nyara Sabally); then the list's own alphabetical order. A former name finds
 * its player too. An empty query has no results.
 */
export function rankPlayers(players: readonly PlayerSummary[], query: string): PlayerSummary[] {
  const words = foldWords(query);
  if (words.length === 0) return [];
  const latest = players.reduce((m, p) => (p.lastYear != null && p.lastYear > m ? p.lastYear : m), -Infinity);
  const scored: { p: PlayerSummary; tier: number; past: number; notFirst: number; i: number }[] = [];
  players.forEach((p, i) => {
    const tier = bestTier(p, words);
    if (tier == null) return;
    scored.push({ p, tier, past: p.lastYear === latest ? 0 : 1, notFirst: firstNameHit(p, words) ? 0 : 1, i });
  });
  scored.sort((a, b) => a.tier - b.tier || a.past - b.past || a.notFirst - b.notFirst || a.i - b.i);
  return scored.map((s) => s.p);
}
