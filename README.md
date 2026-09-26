# WNBA Arc

**How far from normal is this season?**
WNBA Arc shows a player's whole career as one grid of seasons and stats, colored by how far
each number sits from what's normal — for that player, for the league that year, or for the
players at the same position that year. A career year stands out at a glance, and a quiet one does too.

**[Live demo →](https://wnba-arc.netlify.app)**

| Player page — light | Player page — dark |
| :--: | :--: |
| ![A'ja Wilson's season-by-season heatmap with a cell's detail popover open, the career summary plates, and the year-by-year chart, light theme](assets/summary-light.png) | ![The same player page in the dark theme](assets/summary-dark.png) |

---

## The idea

A single stat line rarely tells you much. Is 18 points a big year for a player, or a typical one?
The answer depends on what you compare it to. WNBA Arc keeps the real numbers and adds the
comparison: every season is measured against one **reference** you pick — the player's own career
average, the league average that year, or the average for guards, forwards, or centers that year —
and the color says how unusual it is. Same grid, three different questions.

## What it does

- **One heatmap per career** — every season the player has played, across eight stats (points,
  rebounds, assists, steals, blocks, FG%, 3P%, true shooting %). Warm cells are above the reference,
  cool cells below; the cell shows the value. Missed seasons stay on the timeline as empty rows.
- **Details on demand** — hover, tap, or arrow-key onto a cell and a popover shows the exact value,
  the reference average, the difference, and that season's rank ("3rd of 141 players"), with a link
  to the stat's full history. A tap reveals and never navigates, so a phone gets the same detail as a mouse.
- **One switch for the whole page** — a sticky bar under the player's name (`A'ja vs Self | League |
  Centers`). Both sections follow it, so the page never disagrees with itself. A mode the page can't
  honor stays visible but disabled, with the reason: a one-season player has no "Self", and a player
  with no position on record (most before 2012) has no position segment.
- **Stat detail** — for any one stat: career plates (high, low, career average, best rank and where it
  happened), a per-season dumbbell chart (the season's value against its reference, hollow when it
  can't be compared, a hatched column for a missed year; click a column to highlight its row), and the
  full yearly table with games, minutes, rank, and the difference. For shooting percentages the table
  also shows makes and attempts, so a small sample explains itself, and a season too thin to rank
  says how many shots it needed.
- **Everyone since 1997** — every player who has appeared in a WNBA regular season, past players
  included (1,217 today), so a 2004 season is measured against 2004's whole league. A player who isn't
  on a roster gets her career span under her name ("1997–2003 · G"). Not the word "retired": the
  source's flag can't tell a retirement from a mid-season waiver, so the years speak for themselves.
- **Search** by player or team, accent- and punctuation-insensitive ("aja" finds A'ja Wilson), ranked:
  each typed word is its own check, in any order ("ionescu sab" works); names that start with your
  words come first, then team matches, then letters buried inside a name; players from the latest
  season ahead of past ones, and first-name matches ("sab" → Sabrina) ahead of last-name ones. Keyboard-navigable results list.
- **Linkable** — player, stat, and reference all live in the URL (`/player/aja-wilson/blk?vs=league`),
  so back/forward and sharing work.
- **Light and dark themes** that follow the OS until you choose; headshots carry a quarter-strength
  wash of the player's team color.
- **Honest about the data** — small-sample seasons are shown as uncolored outlined cells and kept out of every average, stats
  that can't be sourced reliably are left out, and the footer says which game the stats run through.

## How the comparison works

All of the logic lives in [`src/lib/deviation.ts`](src/lib/deviation.ts): pure, React-free, and
unit-tested. The same functions feed the heatmap and the stat detail, so the two views always agree.

**Three references.** *Self* compares each season to the player's own career average. *League*
compares each season to that year's league average, and *Position* to that year's average for the
player's position. In the peer modes, the reference is always the same year's crowd — there is no
multi-year window, so the average, the ruler, and the rank all describe one group.

**Color for counting stats** (points, rebounds, assists, steals, blocks) is measured in
**standard-deviation "steps"**: the distance from the reference divided by the comparison group's
spread that year, fully saturated at 3 steps (`FULL_STEPS`). A flat percentage would saturate for
stars (a top scorer clears +50% on nearly every stat) and explode on small numbers (0.1 → 0.2 blocks
reads as +100%); measuring in the group's own spread is honest across stats that vary by very
different amounts.

**Shooting percentages** (FG%, 3P%, TS%) use a relative-change scale instead, full at ±50%
(`BAR_FULL_SCALE`): they never saturate the way counting stats do, and a percent-of-a-percent step
would be hard to read.

**Self mode** scales each stat to the player's own range, with a floor at 0.5 × the league spread
(`HEATMAP_STEP_FLOOR`) so a career that spans a league-trivial range — a tenth of a block — can't paint
itself as dramatic. It needs at least two seasons.

**Ranks** come from the data service: a season's place among the qualified players that year (or among
the player's position, in position mode), 1 = best, from the same pool the averages are computed on.
A shooting percentage ranks in a smaller pool — the qualified seasons that also cleared a made-shot
floor (below) — so "4th of 65" for 3P% sits beside "16th of 122" for points with different, honest
denominators. The "best rank" plate picks the season by its **share** of the pool, not the raw place —
the league keeps adding teams, so 27th of 106 beats 18th of 65.

**Enough games.** Two bars, both scaled to the year's schedule. Under **a quarter of the schedule**
(`COLOR_GAMES_FRACTION`, 11 of 44) a season is hollow in the heatmap (no fill, a faint outline), drawn hollow on the chart, shows
no difference or rank in the table, and is excluded from the career averages. From there up to
**20 games of 44** (`QUALIFYING_GAMES` / `FULL_SCHEDULE_GAMES`, compared in integers and kept equal to
the data service's: 13 of 28 in 1997, 10 of the 2020 bubble's 22 — Basketball-Reference's WNBA per-game
bar, scaled) it is a **partial season**: colored and counted in the career averages, but not ranked, and
marked with an asterisk. Only seasons over the 20-game bar form the crowd behind the averages, spreads,
and ranks, so a partial season is measured against that crowd without being in it. Every asterisked cell
names its caveat with the count in the popover and in its accessible name ("Partial season: 17 of 44
games", "Small sample: 29 attempts from three. Not compared with league average." — the second sentence
follows the mode: "Left out of career average." in self mode, the position's average in position mode) as an
italic asterisk footnote; there is
no key under the grid on purpose.

**Enough shots.** The three shooting percentages carry two more floors. To be **colored** (and drawn on
the chart), a season needs **40 three-point attempts** for 3P%, **100 field-goal attempts** for FG%, or
**100 shooting possessions** (FGA + 0.44 × FTA) for TS% (`TINT_FLOOR`, fixed counts — 40 threes are 40
threes in any era). To be **ranked**, it needs enough attempts OR enough makes, per 44 games and scaled
to the year: **60 three-point attempts or 20 made, 200 field-goal attempts or 85 made, or 125 shooting
possessions** (`RATE_RANK_FLOOR` in the data service, mirrored as `RANK_FLOOR` here only to word the
note). The made counts are Basketball-Reference's; the attempt counts are the same bar at the league's
all-time average, so a high-volume shooter who misses a lot is still ranked and an efficient low-volume
one isn't dropped. The rank pool also requires the color floor, so a ranked season is always a colored
one. A colored cell under the rank floor says why ("Needs 55 attempts from three or 19 made to rank")
instead of leaving a blank. Career shooting averages **pool** makes
and attempts over every counted season (`SUM(made) / SUM(att)`; TS% from total points and shooting
possessions), never a mean of season percentages, so a 2-of-5 season adds two makes to the pool rather
than a 40% year.

**Position averages** start in 2012 (ESPN has no position on record for most players before then) and
need at least 8 qualified players in the (year, position) bucket; where there is no bucket, the cell is
neutral and says so rather than quietly using the league number.

## Architecture

Two repositories make up the system:

- **`wnba-arc`** (this repo) — the React frontend.
- **`wnba-data`** (separate) — a Node/TypeScript + Express + Postgres service that ingests ESPN's
  stats data nightly, computes the derived stats, per-year league and position averages, spreads, and
  ranks, and serves them over a small read-only JSON API.

The API's JSON shape is the contract between them; the frontend keeps its own mirror types (no shared
package). Inside the frontend the dependency direction is one-way — **components → lib → data**:

- **`src/data/`** — the only layer that touches the network. [`api.ts`](src/data/api.ts) is the typed
  client (`getPlayers` / `getPlayer` / `getLeague` / `getPositions` / `getMeta`) and the contract
  types; `stats.ts` defines the eight stats, `teams.ts` the team colors, `featured.ts` the landing
  page's static list.
- **`src/lib/`** — pure logic, no React, no fetch. [`deviation.ts`](src/lib/deviation.ts) turns season
  rows plus league/position data into the heatmap grid, the compare-bar segments, and the stat detail
  (plates, chart, table); `routes.ts` maps players to name-only URL slugs; `playerMeta.ts` builds the
  line under a name; `theme.ts` handles the light/dark choice.
- **`src/routes/` + `App.tsx`** — the shell loads the roster, league, positions, and freshness
  metadata once and shares them via context (`appData.ts`); `PlayerLayout` fetches one player's
  history and gates loading / error / not-found; `PlayerRoute` resolves the URL into a mode and a stat.
- **`src/components/`** — the heatmap and its popover, the compare bar, the stat detail (plates, chart,
  table), search, tooltips, footer, and the landing and about pages.
- **`src/styles/`** — [`theme.css`](src/styles/theme.css) is the single design-system source: tokens
  for the neutral ramp, the diverging heat scale, spacing, the type scale, and both themes. The UI is
  deliberately monochrome — color is reserved for data (the red/blue heat) and identity (team tints).

Routing uses **name-only slugs** (`/player/aja-wilson`, `/player/aja-wilson/blk`) with `?vs=league` or
`?vs=position` for the reference (self is the default), so the full view state lives in the URL.

## Accessibility

Built to **WCAG 2.1 AA**, with the 2.2 additions where they apply:

- The heatmap is a real ARIA grid with a roving tabindex — one Tab stop, arrow keys move between
  cells, Enter opens the stat's history. Each cell's accessible name carries the value, the difference,
  the reference, and the rank, so nothing is pointer-only.
- Tooltips and the cell popover are hoverable, dismissible with Escape, and reachable by keyboard
  (1.4.13). Disabled compare-bar segments stay focusable so their reason is reachable.
- Focus is never hidden under the sticky bar (2.4.11); the heatmap and the chart scroll sideways on
  phones so the page never does (1.4.10); animations have static fallbacks under
  `prefers-reduced-motion`; focus rings survive `forced-colors`.
- Every interactive state has been scanned with axe in Chromium, Firefox, and WebKit, in both themes —
  zero violations. A manual screen-reader pass has not been done yet.

## Tech

- **React 19 + TypeScript + Vite**
- **react-router 7** — player / stat / reference state lives in the URL
- Plain-CSS design tokens, no CSS framework; type set in Barlow and Barlow Condensed (Google Fonts)
- **vitest** on the pure logic
- Data from the **companion service** (`wnba-data`) over a small JSON contract

## Running locally

Requires Node 20.19+ or 22.12+ and a running instance of the data API on its default port (3001).

```bash
npm install
npm run dev               # http://localhost:5173 (or the next free port)
```

No `.env` is needed in dev: the Vite dev server proxies `/api` to the data API (`vite.config.ts`), so
the browser never makes a cross-origin request. `VITE_API_BASE` is only for production builds, where it
points at the deployed API (see `.env.example`).

To try it on a phone, start the dev server with `npm run dev -- --host` and open the network URL Vite
prints; the proxy means the phone needs no access to the API itself.

Other scripts:

```bash
npm run build     # type-check (tsc -b) + production build
npm run preview   # serve the production build locally
npm run lint      # type-check only
npm run test      # run the unit tests (vitest) once
npm run test:watch # re-run tests on change
```

Tests cover the pure logic: the grid, references, small-sample gating, pooled averages, the compare-bar
segments, the fitted chart axis, and the best-rank rule in `deviation.test.ts`; URL slugs in
`routes.test.ts`; the header line in `playerMeta.test.ts`; stat descriptions, team colors, the footer's
freshness line, and tooltip placement in their own files.

## Data source

Player stats come from ESPN's public stats data, refreshed nightly by the data service. True shooting %
is computed from box-score totals; the service also derives other efficiency and usage rates, but only
TS% is shown here. A few stats are intentionally omitted — rebound percentages need opponent data that
isn't published, and all-in-one metrics like PER can't be derived from a box score — rather than
shipping unreliable numbers.

WNBA Arc is an independent, unofficial project, not affiliated with the WNBA or ESPN.
