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
 * needs no focus-trap handling. Reachable from the header on any screen; "Back"
 * returns the user to wherever they were (reconstructed in App from view state).
 */
export function AboutView({ onBack }: AboutViewProps) {
  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "var(--space-10) var(--space-5) var(--space-12)" }}>
      <button className="btn btn-ghost" style={{ marginBottom: "var(--space-5)", paddingInline: 0 }} onClick={onBack}>
        ← Back
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
          simply max out. Click into any stat for its full year-by-year history and where the season ranks — its
          percentile against the league or the chosen position. Shooting percentages are the exception — they're shown
          as a plain gap from the average.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>The data</h2>
        <p style={{ marginBottom: "var(--space-3)" }}>
          ARC pulls from ESPN and refreshes nightly, so the current season keeps up as games are played.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Who's in.</strong> Any player who's appeared in the last three seasons. Players who miss a year for
          injury, maternity, or an overseas stint stick around, with the gap shown right in their timeline.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>Small samples.</strong> A season where the player appeared in less than 25% of the schedule is left
          out of baselines, so a handful of games can't skew the math.
        </p>
        <p style={{ marginBottom: "var(--space-3)" }}>
          <strong>What's missing.</strong> A few stats need data ESPN doesn't share (rebound percentages, and all-in-one
          metrics like PER), so ARC leaves them out rather than guessing.
        </p>
        <p className="text-muted" style={{ margin: 0, fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
          ARC is an independent, unofficial project — not affiliated with, endorsed by, or connected to the WNBA or
          ESPN. All team and player names, logos, and photos are the property of their respective owners.
        </p>
      </section>
    </main>
  );
}
