/**
 * Featured players — a small, hand-curated set shown on the select screen so it
 * paints INSTANTLY, before the full player list finishes loading from the API.
 *
 * ALL display fields are static (espn, name, position, team) so the whole card
 * renders at once with no field lagging behind. None of it is truly immutable —
 * it's a spectrum: espn never changes (the stable anchor), name/position change
 * rarely, team changes most often (trades). We accept that this can drift and keep
 * it current two ways:
 *   - by hand (edit this file) — the espn ids never move, so only the display text
 *     needs touching;
 *   - (planned) a scraper notification that pings when a featured player's
 *     name/position/team changes, so we know when to update.
 * team values below were pulled from the DB, current as of the last scrape.
 *
 * Keyed on `espn` (the permanent external id), NOT the DB `id` — surrogate ids get
 * reassigned on a rebuild, so they must never be hardcoded. At click time we map
 * espn → current id from the loaded /players list.
 */

export interface FeaturedPlayer {
  espn: string;
  name: string;
  pos: string;
  team: string;
}

export const FEATURED: FeaturedPlayer[] = [
  { espn: "3149391", name: "A'ja Wilson", pos: "C", team: "Las Vegas Aces" },
  { espn: "2998928", name: "Breanna Stewart", pos: "F", team: "New York Liberty" },
  { espn: "4433730", name: "Paige Bueckers", pos: "G", team: "Dallas Wings" },
  { espn: "4433403", name: "Caitlin Clark", pos: "G", team: "Indiana Fever" },
  { espn: "4433791", name: "Olivia Miles", pos: "G", team: "Minnesota Lynx" },
  { espn: "3142328", name: "Gabby Williams", pos: "F", team: "Golden State Valkyries" },
  { espn: "4433402", name: "Angel Reese", pos: "F", team: "Atlanta Dream" },
  { espn: "3917450", name: "Napheesa Collier", pos: "F", team: "Minnesota Lynx" },
  { espn: "3142191", name: "Kelsey Mitchell", pos: "G", team: "Indiana Fever" },
  { espn: "3904576", name: "Marina Mabrey", pos: "G", team: "Toronto Tempo" },
  { espn: "3906949", name: "Jessica Shepard", pos: "F", team: "Dallas Wings" },
  { espn: "2529140", name: "Alyssa Thomas", pos: "F", team: "Phoenix Mercury" },
  { espn: "3065570", name: "Kelsey Plum", pos: "G", team: "Phoenix Mercury" },
  { espn: "3058901", name: "Allisha Gray", pos: "G", team: "Atlanta Dream" },
  { espn: "4398674", name: "Rhyne Howard", pos: "G", team: "Atlanta Dream" },
  { espn: "4066533", name: "Sabrina Ionescu", pos: "G", team: "New York Liberty" },
];
