import type { PlayerSummary } from "../data/api";

/**
 * Player search: matching + ranking, pure and tested (designed with the user, 2026-09-25 —
 * DECISIONS). Before this the search folded a name to bare letters and kept any player whose
 * folded name CONTAINED the folded query, in roster (alphabetical) order — so "sab" listed Alisa
 * Burras and Elisabeth Cebrian (a-l-i-S-A-B-urras) above Sabrina Ionescu, seventh of nine.
 *
 * Now each typed word is its own check, and a player matches only when EVERY word matches:
 *   - the START of a word of their name ("sab" → Sabrina, Sabally; "io" → Ionescu), or
 *   - the START of a word of their team ("sun" → Connecticut Sun), or
 *   - letters somewhere INSIDE a name word — the weak match, kept on purpose so "aja" or an
 *     accent-stripped fragment still finds someone, but ranked last.
 * Word order doesn't matter ("ionescu sab" = "sab ionescu"). Folding strips accents, apostrophes
 * and punctuation so "aja" matches "A'ja" and "hamby" matches "Hamby" however the source spells it.
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

/** How well ONE typed word matches a player. Lower is better; null = no match. */
type WordMatch = 0 | 1 | 2;

function matchWord(word: string, nameWords: string[], teamWords: string[]): WordMatch | null {
  if (nameWords.some((w) => w.startsWith(word))) return 0;
  if (teamWords.some((w) => w.startsWith(word))) return 1;
  // Mid-word, or a run of letters that crosses a word boundary ("sab" in "alisaburras" — kept
  // for the accent/apostrophe cases; the boundary case rides along and ranks last).
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

/** True when a typed word starts the player's FIRST name ("sab" → Sabrina Ionescu, not Nyara Sabally). */
function firstNameHit(p: Pick<PlayerSummary, "name">, queryWords: string[]): boolean {
  const first = foldWords(p.name)[0];
  return first != null && queryWords.some((w) => first.startsWith(w));
}

/**
 * Filter + rank the roster for a query. Tier first; within a tier, players who played in the
 * most recent season on record ("current" — the latest `lastYear` in the roster, so it rolls
 * forward each season and a player waived mid-season still counts) before everyone else; then
 * first-name matches before other matches (user, 2026-09-25: most people search by first name —
 * "sab" puts Sabrina Ionescu above Nyara Sabally; current still outranks it, so a 2004 Sabrina
 * stays under both current Saballys); then the roster's own order (alphabetical). Empty query →
 * no results (the dropdown shows nothing).
 */
export function rankPlayers(players: readonly PlayerSummary[], query: string): PlayerSummary[] {
  const words = foldWords(query);
  if (words.length === 0) return [];
  const latest = players.reduce((m, p) => (p.lastYear != null && p.lastYear > m ? p.lastYear : m), -Infinity);
  const scored: { p: PlayerSummary; tier: number; past: number; notFirst: number; i: number }[] = [];
  players.forEach((p, i) => {
    const tier = matchTier(p, words);
    if (tier == null) return;
    scored.push({ p, tier, past: p.lastYear === latest ? 0 : 1, notFirst: firstNameHit(p, words) ? 0 : 1, i });
  });
  scored.sort((a, b) => a.tier - b.tier || a.past - b.past || a.notFirst - b.notFirst || a.i - b.i);
  return scored.map((s) => s.p);
}
