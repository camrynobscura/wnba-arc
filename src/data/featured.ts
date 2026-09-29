/**
 * Featured players: a small hand-picked set shown on the landing page at once, before the player list
 * loads from the API. Every display field is static (ESPN id, name, position, team), so a card renders with
 * nothing lagging behind. The ESPN id never changes; the rest can drift (a trade), so the daily data
 * refresh sends an alert when a featured player's name, position or team changes, and this file is updated
 * by hand.
 *
 * Keyed on the ESPN id, not the database id, which can change on a rebuild. The player page maps one to
 * the other from the loaded /players list.
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
  { espn: "1068", name: "Nneka Ogwumike", pos: "F", team: "Los Angeles Sparks" },
  { espn: "4433524", name: "Sonia Citron", pos: "G", team: "Washington Mystics" },
  { espn: "3142191", name: "Kelsey Mitchell", pos: "G", team: "Indiana Fever" },
  { espn: "3904576", name: "Marina Mabrey", pos: "G", team: "Toronto Tempo" },
  { espn: "3906949", name: "Jessica Shepard", pos: "F", team: "Dallas Wings" },
  { espn: "2529140", name: "Alyssa Thomas", pos: "F", team: "Phoenix Mercury" },
  { espn: "3065570", name: "Kelsey Plum", pos: "G", team: "Phoenix Mercury" },
  { espn: "4066533", name: "Sabrina Ionescu", pos: "G", team: "New York Liberty" },
  { espn: "4433405", name: "Kamilla Cardoso", pos: "C", team: "Chicago Sky" },
  { espn: "2490553", name: "Brittney Griner", pos: "C", team: "Connecticut Sun" },
  { espn: "4398729", name: "Emily Engstler", pos: "F", team: "Portland Fire" },
  { espn: "5220150", name: "Dominique Malonga", pos: "C", team: "Seattle Storm" },
];
