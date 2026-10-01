/**
 * Records the API answers the end-to-end tests replay (e2e/fixtures/): the league and position averages, the
 * freshness line, and a few players picked for what they exercise, trimmed from the full list to those players.
 * Run it again when the API's shape changes, then run the tests against the new answers.
 *
 *   node scripts/record-e2e-fixtures.mjs          (API_BASE=http://localhost:3001 to record from a local API)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as prettier from "prettier";

const API = process.env.API_BASE ?? "https://wnba-data-api.onrender.com";
const OUT = new URL("../e2e/fixtures/", import.meta.url);

/** By ESPN id, and why each is here. */
const PLAYERS = {
  3149391: "A'ja Wilson: a nine-season career, a center",
  4433730: "Paige Bueckers: two seasons, a guard",
  4065692: "Aaliyah Wilson: one season, so no comparison with her own career",
  141: "Cynthia Cooper: no position on record (before 2012)",
  120: "Michelle Campbell (1999–2000): shares a name, so both addresses carry the ESPN id",
  2069162: "Michelle Campbell (2013)",
  3054590: "Nia Brodie: formerly Nia Coffey, so her old address and a search for the old name still find her",
};

async function get(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function write(name, data) {
  const file = new URL(`${name}.json`, OUT);
  const options = { ...(await prettier.resolveConfig(file)), parser: "json" };
  writeFileSync(file, await prettier.format(JSON.stringify(data), options));
}

mkdirSync(OUT, { recursive: true });
const players = (await get("/players?scope=all")).filter((p) => p.espn in PLAYERS);
if (players.length !== Object.keys(PLAYERS).length) throw new Error(`found ${players.length} of the players`);
await write("players", players);
for (const p of players) await write(`player-${p.id}`, await get(`/players/${p.id}`));
await write("league", await get("/league"));
await write("positions", await get("/positions"));
await write("meta", await get("/meta"));
console.log(`recorded ${players.length} players from ${API}`);
