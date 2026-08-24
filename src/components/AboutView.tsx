interface AboutViewProps {
  onBack: () => void;
}

// Section headers: larger than the old 20px and set apart from the body with a
// divider + generous top space, so the three sections read as clear tiers under
// the page title rather than sitting flush with the paragraphs beneath them.
const sectionStyle: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 28,
  borderTop: "1px solid var(--color-divider)",
};
const h2Style: React.CSSProperties = {
  fontSize: 26,
  letterSpacing: "-0.01em",
  marginBottom: 14,
};

/**
 * Static "about" page explaining what ARC shows, how to read it, and where the
 * data comes from. A top-level view (not a modal) so the content has room and
 * needs no focus-trap handling. Reachable from the header on any screen; "Back"
 * returns the user to wherever they were (reconstructed in App from view state).
 */
export function AboutView({ onBack }: AboutViewProps) {
  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "36px 20px 48px" }}>
      <button className="btn btn-ghost" style={{ marginBottom: 20, paddingInline: 0 }} onClick={onBack}>
        ← Back
      </button>

      <h1 style={{ fontSize: 44, marginBottom: 4 }}>About ARC</h1>

      <section style={{ marginTop: 24 }}>
        <h2 style={h2Style}>What ARC shows</h2>
        <p style={{ marginBottom: 12 }}>
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
        <p style={{ marginBottom: 12 }}>Two controls set what "normal" means:</p>
        <p style={{ marginBottom: 12 }}>
          <strong>Baseline.</strong> Measure a player against their own history or against the league. When it's their
          own, the season you're viewing is left out, so a big year always looks like one.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>Window.</strong> Choose what the baseline covers: their whole career, the previous five years, the
          previous year, or — for a league or same-position comparison — just this season. Options that wouldn't
          change anything are hidden, so what you see always matters.
        </p>
        <p style={{ margin: 0 }}>
          Each player has two views. <strong>Career Trend</strong> grids every season against their career average
          (warmer above, cooler below) so a whole career reads at a glance. <strong>Season Breakdown</strong> takes one
          season and shows each stat as a bar. Click any stat to see its full history.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>The data</h2>
        <p style={{ marginBottom: 12 }}>
          ARC pulls from ESPN and refreshes nightly, so the current season keeps up as games are played.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>Who's in.</strong> Any player who's appeared in the last three seasons. Players who miss a year for
          injury, maternity, or an overseas stint stick around, with the gap shown right in their timeline.
        </p>
        <p style={{ marginBottom: 12 }}>
          <strong>Small samples.</strong> A season where the player appeared in less than 25% of the schedule is left
          out of baselines, so a handful of games can't skew the math.
        </p>
        <p style={{ margin: 0 }}>
          <strong>What's missing.</strong> A few stats need data ESPN doesn't share (rebound percentages, and all-in-one
          metrics like PER), so ARC leaves them out rather than guessing.
        </p>
      </section>
    </main>
  );
}
