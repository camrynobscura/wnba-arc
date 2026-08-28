# WNBA Arc

**Is this the best season of a player's career, or just another year at the office?**
WNBA Arc reframes each stat as a distance from what's normal, so a career year stands out
at a glance and a quiet one does too.

**[Live demo →](https://wnba-arc.netlify.app)**

| Season summary — light | Season summary — dark |
| :--: | :--: |
| ![Career Trend heatmap and season deviation bars, light theme](assets/summary-light.png) | ![The same player summary in dark theme](assets/summary-dark.png) |

---

## The idea

A single stat line rarely tells you much. Is 18 points a big year for a player, or a
typical one? WNBA Arc answers that by measuring every stat against a baseline — the league
that season, or the player's same-position peers — and showing how far above or below that
baseline each stat lands. You still see the real numbers; the visualization just tells you
how unusual they are.

## What it does

- **Career Trend** — a heatmap of every season against the player's own career average
  (warmer above, cooler below), so a whole career reads in one glance.
- **Season comparison** — for one selected season, segmented deviation bars showing each
  stat against that year's baseline, with the real value as the headline.
- **Single-stat drill-down** — a year-by-year dumbbell chart plus a full history table
  (makes/attempts for shooting %s, value, games, minutes, percentile, and delta vs.
  baseline) for any stat.
- **Two baselines** — compare a season against the whole **league** that year, or other
  players at the **same position** (guards / forwards / centers) that year. Same-position is
  offered only when there's a real sample; it never silently falls back to the league.
- **Honest about the data** — missed seasons show as gaps in the timeline, small-sample
  seasons are flagged and kept out of baselines, and stats that can't be sourced reliably are
  left out rather than estimated.
- **Shareable, linkable** — player, stat, season, and comparison all live in the URL, so
  back/forward and link-sharing work.
- **Light & dark themes** that follow the OS by default, with a manual toggle.

## How the deviation math works

The core question is *"how far from normal is this number?"* — and both "normal" and "far"
mean different things for different stats, so the bar metric is chosen per stat type. All of
this lives in [`src/lib/deviation.ts`](src/lib/deviation.ts): pure, React-free, and
unit-tested.

**Baseline.** Every comparison is against the **subject season's** peer group — the whole
league that year, or the player's position peers that year. There's no multi-year window: one
season is compared to that same season's crowd, so the baseline, the bar's ruler, and the
percentile all come from one coherent group. Position averages are gated at ≥ 8 qualified
players, so thin buckets (mostly pre-2015) aren't offered rather than silently collapsing to
the league.

**Counting stats** (points, rebounds, assists, steals, blocks) are measured in
**standard-deviation "steps"**: the distance from the baseline divided by the comparison
group's spread, with a full bar at **3 steps** (`FULL_STEPS`). This replaced a
relative-percentage bar that had two measured failures — it *saturated* for elite players (a
star clears +50% on nearly every stat, so every bar pinned to full) and it *exploded* on
small-denominator stats (0.1 → 0.2 blocks reads as +100%). Measuring in the group's own spread
is honest across stats that vary by very different amounts.

**Shooting percentages** (FG%, 3P%, TS%) keep a **relative-change bar** (full at ± 50%,
`BAR_FULL_SCALE`): they don't saturate — a great shooter is only ~ +13–36% over the league —
and a percent-of-a-percent step would be hard to read.

**Percentile.** For counting stats, each season's rank within its group is interpolated from
stored decile ladders and shown as the "Pct" column in the drill-down table. The bar answers
*how far*; the percentile answers *how rare* — two different questions, so both are shown.

**Small samples** are gated two independent ways: a season under **25%** of the scheduled
slate (`SMALL_SAMPLE_FRACTION`, kept in sync with the data service) and a shooting % on fewer
than **10 attempts** (`MIN_RATE_ATTEMPTS`). Gated seasons are greyed in the heatmap, dropped
from the drill-down chart, kept in the table, and excluded from baseline averages — so a
1-for-1 "100%" three-point year can't distort anything.

**Career Trend** is the one view that measures a player against *their own* career average,
self-scaled to their own range — with a floor at 0.5 × the league spread, so a career that
spans a league-trivial range (a tenth of a block) can't paint itself as dramatic.

## Architecture

Two repositories make up the system:

- **`wnba-arc`** (this repo) — the React frontend.
- **`wnba-data`** (separate, private) — a Node/TypeScript + Express + Postgres service that
  scrapes ESPN nightly, computes the derived stats and per-season league/position baselines,
  and serves them over a small read-only JSON API.

The API's JSON shape is the contract between them; the frontend keeps its own mirror types (no
shared package). Inside the frontend, the dependency direction is strictly one-way —
**components → lib → data**:

- **`src/data/`** — the only layer that touches the network. [`api.ts`](src/data/api.ts) is
  the typed client (`getPlayers` / `getPlayer` / `getLeague` / `getPositions` / `getMeta`) and
  the contract types; `stats.ts` holds the stat definitions and `featured.ts` the
  landing-page list.
- **`src/lib/`** — pure logic, no React, no fetch. [`deviation.ts`](src/lib/deviation.ts)
  turns raw season rows plus league/position data into baseline context, deviation rows, and
  per-stat detail; `routes.ts` maps players to name-only URL slugs; `theme.ts` handles the
  light/dark choice. `deviation.ts` and `routes.ts` are unit-tested — which is *why* they're
  kept free of React.
- **`src/routes/` + `App.tsx`** — the shell loads the roster, league, positions, and freshness
  metadata once and shares them via context (`appData.ts`); route components (`PlayerLayout`,
  `SummaryRoute`, `StatRoute`, …) fetch each player's detail on demand and gate loading /
  error / not-found states.
- **`src/components/`** — presentational components: the heatmap, deviation bars, drill-down,
  search, and so on.
- **`src/styles/`** — [`theme.css`](src/styles/theme.css) is the single design-system source
  (tokens for color ramps, spacing, the type scale, and both themes); `app.css` holds a few
  interaction styles.

Routing uses **name-only slugs** (`/player/aja-wilson`, `/player/aja-wilson/blk`) with
`?year=` / `?vs=` query params, so the full view state lives in the URL.

## Accessibility

Built to **WCAG 2.1 AA**: keyboard-operable throughout, semantic landmarks and headings,
non-color cues alongside every color encoding, and AA-contrast text in both themes. Audited
with axe across Chromium, Firefox, and WebKit — zero violations.

## Tech

- **React 19 + TypeScript + Vite**
- **react-router** in declarative SPA mode — player / stat / season / comparison state lives
  in the URL
- Plain-CSS design-system tokens (a single source for spacing, color ramps, the type scale,
  and both themes) — no CSS framework
- A layered structure (see [Architecture](#architecture)): typed API client → pure logic → components
- Data comes from a **companion service** (a separate Node/TypeScript + Express + Postgres
  API) over a small JSON contract. This repo is the frontend of that two-part system.

## Running locally

Requires Node 20+ and a running instance of the data API.

```bash
npm install
cp .env.example .env      # then set VITE_API_BASE to your data API's URL
npm run dev               # http://localhost:5173
```

Other scripts:

```bash
npm run build     # type-check (tsc -b) + production build
npm run preview   # serve the production build locally
npm run lint      # type-check only
npm run test      # run the unit tests (vitest) once
npm run test:watch # re-run tests on change
```

Tests cover the pure logic in `src/lib/` — the baseline and deviation math (subject
selection, small-sample gating, step-vs-relative bar geometry, position baselines, and
percentiles) in `deviation.test.ts`, and the URL-slug helpers in `routes.test.ts`.

## Data source

Player stats come from ESPN's public stats data, refreshed nightly, with efficiency stats
(true shooting %, usage rate, and the rest) computed from box-score totals so they stay
consistent with the raw numbers. A few stats are intentionally omitted — rebound percentages
need opponent data that isn't published, and all-in-one metrics like PER can't be derived
from a box score — rather than shipping unreliable numbers.
