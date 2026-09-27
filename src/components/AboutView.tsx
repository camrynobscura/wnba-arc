interface AboutViewProps {
  onBack: () => void;
}

// Section headers: larger than the old 20px and set apart from the body with a
// divider + generous top space, so the three sections read as clear tiers under
// the page title rather than sitting flush with the paragraphs beneath them.
const sectionStyle: React.CSSProperties = {
  marginTop: "var(--space-10)",
  paddingTop: "var(--space-8)",
  borderTop: "1px solid var(--color-divider)",
};
const h2Style: React.CSSProperties = {
  fontSize: "var(--fs-2xl)",
  letterSpacing: "-0.01em",
  marginBottom: "var(--space-4)",
};

/**
 * Static "about" page explaining what ARC shows, how to read it, and where the
 * data comes from. A top-level view (not a modal) so the content has room and
 * needs no focus-trap handling. Reachable from every page's footer; "Back" returns the
 * reader to where they came from (history back — AboutRoute; the landing page for a cold link).
 */
export function AboutView({ onBack }: AboutViewProps) {
  return (
    <main id="main" className="view-main" style={{ padding: "var(--space-10) var(--space-5) var(--space-12)" }}>
      <button className="btn btn-ghost" style={{ marginBottom: "var(--space-5)", paddingInline: 0 }} onClick={onBack}>
        {/* The arrow is decoration — hidden, or it's read out ("left arrow Back"). One wrapping span:
            `.btn` is a flex box, and the arrow as its own flex item would sit a 6px gap away, not a space. */}
        <span>
          <span aria-hidden="true">←</span> Back
        </span>
      </button>

      <h1 style={{ fontSize: "var(--fs-4xl)", marginBottom: "var(--space-1)" }}>About ARC</h1>

      <section style={{ marginTop: "var(--space-6)" }}>
        <h2 style={h2Style}>What ARC shows</h2>
        <p style={{ marginBottom: "var(--space-3)" }}>
          Is this the best season of a player's career, or just another year at the office? A single stat line
          rarely tells you.
        </p>
        <p style={{ margin: 0 }}>
          ARC answers that by measuring every stat against what's normal for that player. You still see the real
          numbers, but each one is shown as how far it lands above or below their usual, so a career year stands out
          immediately and a quiet one does too.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How to read it</h2>
        <p style={{ marginBottom: "var(--space-3)" }}>
          Each player has two views. <strong>Career Trend</strong> grids every season against that player's own career
          average (warmer above, cooler below), so a whole career reads at a glance. The <strong>league comparison</strong>{" "}
          below it takes one season and shows how each stat stacks up against everyone else that year.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Two controls.</strong> Pick the <strong>season</strong>, then choose what to compare it against — the
          whole <strong>league</strong> average, or other players at the same <strong>position</strong> (guards,
          forwards, or centers) — for that same year.
        </p>
        <p style={{ margin: 0 }}>
          <strong>The bars.</strong> A bar's length is how far the stat lands from that average — but measured against
          how much players actually differ on it, not as a flat percentage. That keeps an ordinary bump on a low-volume
          stat (a tenth of a block) small, while a genuinely rare number — leading the league in rebounds — fills the
          bar. A full bar is about as far from normal as anyone gets, so the handful of all-time seasons past that point
          simply max out. Click into any stat for its full year-by-year history and where each season ranked — "6th of
          122" among everyone who played enough that year, or among the chosen position. Shooting percentages are
          shown as a plain gap from the average, and rank among the players who shot enough (below).
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>The data</h2>
        <p style={{ marginBottom: "var(--space-3)" }}>
          ARC pulls from ESPN and refreshes nightly, so the current season keeps up as games are played.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Who's in.</strong> Every player who has appeared in a WNBA game since the league's first season in
          1997, retired players included. A current player who misses a year for injury, maternity, or an overseas
          stint sticks around, with the gap shown right in her timeline.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Measured against the whole league.</strong> The averages and ranks a season is compared with include
          everyone who played enough of that year (below) — so a 2004 season is measured against 2004's whole league,
          not just the players still around today. That crowd is wider than the WNBA's own leaderboard, which
          requires about 70% of the schedule, so "6th of 122" here is not the same count as "6th of 105" there.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Positions start in 2012.</strong> ESPN has no position on record for most players before then, so
          comparing with other guards, forwards, or centers is offered from 2012 on; the league comparison covers every
          year. A player's position is her current one, applied across her whole career.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Enough games.</strong> Two bars, both scaled to the year's schedule. Under a quarter of the schedule
          (11 games of 44) a season is still listed, as an uncolored outlined cell, but not compared and left out of the averages, so a
          handful of games can't count as a year. From there up to 20 games of 44 (13 of 28 in 1997, 10 of the
          2020 bubble's 22 — Basketball-Reference's bar for its WNBA leaders) it is a <em>partial season</em>: colored
          and counted, but not ranked, and marked with an asterisk. Only seasons over the 20-game bar make up the
          crowd behind the averages and ranks. Every asterisked cell says what the mark is about when you tap or hover
          it — "Partial season: 17 of 44 games", "Small sample: 29 attempts from three".
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Enough shots.</strong> A shooting percentage is only as good as the number of shots behind it, so
          the three percentages have two more bars. To get a color, a season needs 40 three-point attempts (3P%),
          100 field-goal attempts (FG%), or 100 shooting possessions (TS% — field-goal attempts plus 0.44 × free-throw
          attempts). To get a rank, it needs enough attempts or enough makes, per 44 games and scaled to the year:
          60 three-point attempts or 20 made, 200 field-goal attempts or 85 made, or 125 shooting possessions. The
          made counts are Basketball-Reference's; the attempts route means a player who shoots a lot and misses a lot
          is still ranked. A colored cell that falls short says so ("Needs 55 attempts from three or 19 made to
          rank"), and ranks among the players who cleared it — so a 4-of-10 can't lead the league at 40%. Career percentages pool every counted season's makes and attempts, so a thin season adds its
          few shots to the total rather than a whole season's worth of noise.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>What's missing.</strong> A few stats need data ESPN doesn't share (rebound percentages, and all-in-one
          metrics like PER), and a handful of one-game appearances from the early 2000s have no record at all, so ARC
          leaves them out rather than guessing.
        </p>
        <p className="text-muted" style={{ margin: 0, fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
          ARC is an independent, unofficial project — not affiliated with, endorsed by, or connected to the WNBA or
          ESPN. All team and player names, logos, and photos are the property of their respective owners.
        </p>
      </section>
    </main>
  );
}
