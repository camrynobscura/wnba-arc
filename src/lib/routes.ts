import { STATS } from "../data/stats";
import type { ComparisonTarget, HeatmapMode, StatKey } from "./deviation";

/** Minimal roster shape the path helpers need — kept structural so routes.ts stays decoupled
 *  from the API types (and so tests can pass plain objects). */
type RosterEntry = { espn: string; name: string };

/** "A'ja Wilson" → "aja-wilson" — the readable slug that identifies a player in the URL. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (é → e)
    .replace(/['’‘]/g, "") // drop apostrophes so "A'ja" → "aja", not "a-ja"
    .replace(/[^a-z0-9]+/g, "-") // everything else → a single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/** Does another current player share this exact slug? (The only case a bare name is ambiguous.)
 *  Zero collisions across the current roster today; this future-proofs the rare identical-slug. */
function slugCollides(slug: string, espn: string, roster: readonly RosterEntry[] | null | undefined): boolean {
  return roster?.some((p) => p.espn !== espn && slugifyName(p.name) === slug) ?? false;
}

/** Path to a player's summary, e.g. "/player/aja-wilson". Name-only — the stable espn id is NOT
 *  surfaced in the URL. It's appended ("…-3149391") ONLY when another current player has the same
 *  slug (needs the roster to detect), or as a last resort when the name has no slug-able chars. */
export function playerPath(name: string, espn: string, roster?: readonly RosterEntry[] | null): string {
  const slug = slugifyName(name);
  if (!slug) return `/player/${espn}`; // no letters/digits in the name → fall back to the id
  return `/player/${slugCollides(slug, espn, roster) ? `${slug}-${espn}` : slug}`;
}

/** Path to a single-stat drill-down under a player, e.g. "/player/aja-wilson/blk". */
export function statPath(name: string, espn: string, stat: StatKey, roster?: readonly RosterEntry[] | null): string {
  return `${playerPath(name, espn, roster)}/${stat}`;
}

/** Resolve a URL slug back to a player's espn id. Prefers a trailing "-<digits>" (the collision
 *  form, or a bare id) so those resolve without the roster; otherwise matches the slug against the
 *  roster by slugified name. Null when unresolvable (roster not loaded, or no such player). */
export function espnForSlug(slug: string | undefined, roster: readonly RosterEntry[] | null): string | null {
  if (!slug) return null;
  const idTail = slug.match(/-(\d+)$/) ?? slug.match(/^(\d+)$/); // "…-3149391" or a bare "3149391"
  if (idTail) return idTail[1];
  if (!roster) return null; // a name-slug can only be resolved once the roster is in
  return roster.find((p) => slugifyName(p.name) === slug)?.espn ?? null;
}

/** Narrow an arbitrary URL segment to a known stat key, else null (→ redirect/404). */
export function toStatKey(seg: string | undefined): StatKey | null {
  return STATS.some((st) => st.key === seg) ? (seg as StatKey) : null;
}

/** Read the compare-target from the `vs` query value: "position" or the league default. Used by
 *  the drill-down, which has no "self" baseline — so `vs=self` reads through as league here. */
export function toTarget(vs: string | null): ComparisonTarget {
  return vs === "position" ? "position" : "league";
}

/** Read the heatmap reference mode from the `vs` query value; default (absent/unknown) = self. */
export function toMode(vs: string | null): HeatmapMode {
  return vs === "league" ? "league" : vs === "position" ? "position" : "self";
}
