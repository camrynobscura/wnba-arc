import { useRef } from "react";
import { useArrivalFocus } from "../pageArrival";

interface AboutViewProps {
  onBack: () => void;
}

// The games and shots minimums this page states are lib/deviation's QUALIFYING_GAMES,
// COLOR_GAMES_FRACTION, TINT_FLOOR and RANK_FLOOR: change them together.
const sectionStyle: React.CSSProperties = {
  marginTop: "var(--space-10)",
  paddingTop: "var(--space-8)",
  borderTop: "1px solid var(--color-divider)",
};
// A step under the title: section headings, not a second title.
const h2Style: React.CSSProperties = {
  fontSize: "var(--fs-xl)",
  letterSpacing: "-0.01em",
  marginBottom: "var(--space-4)",
};

/**
 * The About page: what Arc shows, how to read it, and where the data comes from. Reached from every
 * page's footer; "Back" returns to where the reader came from (AboutRoute: history back, or the landing
 * page for a link opened directly).
 */
export function AboutView({ onBack }: AboutViewProps) {
  // The heading takes focus when the page arrives by a page change (pageArrival.ts).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useArrivalFocus(headingRef);
  return (
    <main id="main" className="view-main" style={{ padding: "var(--space-10) var(--space-5) var(--space-12)" }}>
      <button className="btn btn-ghost" style={{ marginBottom: "var(--space-5)", paddingInline: 0 }} onClick={onBack}>
        {/* The arrow is decoration, hidden or it's read out ("left arrow Back"). One wrapping span: `.btn`
            is a flex box, and the arrow as its own flex item would sit a 6px gap away, not a space. */}
        <span>
          <span aria-hidden="true">←</span> Back
        </span>
      </button>

      <h1 ref={headingRef} tabIndex={-1} className="page-heading" style={{ fontSize: "var(--fs-3xl)", marginBottom: "var(--space-4)" }}>
        About Arc
      </h1>
      <p>
        Is a WNBA player averaging 15 points per game having a good season? Well, it depends on the player. For a superstar they could be slumping, but for a bench player they could be having a breakout season. Arc lets you compare a player's season
        with different averages: their own career, the whole league that year, or players at their same position. This lets you see how well they're doing in the current season (or other years) compared to the rest of their career, and compared to the rest of the league.
      </p>
      <p style={{ margin: 0 }}>
        Each player page shows their career heatmap, with each cell representing a season's average for a stat, like 15.2 points per game. The color
        shows if the year's stat is above or below average: the more red, the more above average, and the more blue, the more below average.
      </p>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How to read it</h2>
        <ul className="about-list">
          <li>
            <strong>How strong the colors are:</strong> comparing with the league or a position, the color depends on
            how unusual the number is. Most players are close together on blocks, so one block above average shows up
            much stronger than one point above average. Comparing with the player's own career, the colors follow
            their own ups and downs, so their best and worst years stand out.
          </li>
          <li>
            <strong>Outlined, no color:</strong> they didn't play enough games, or take enough shots, to compare fairly.
          </li>
          <li>
            <strong>An asterisk (*):</strong> there's a note about that season, like a partial season.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>The data</h2>
        <ul className="about-list">
          <li>
            <strong>Where it comes from:</strong> ESPN, updated every morning.
          </li>
          <li>
            <strong>Who's in it:</strong> every WNBA player since the league started in 1997, over 1,200 of them,
            including retired players. The only ones missing are a handful of very short appearances that ESPN has no
            usable record of.
          </li>
          <li>
            <strong>Averages and ranks</strong> include everyone who played enough games that season, not just players
            still in the league today. So a 2004 season is compared with the whole 2004 league.
          </li>
          <li>
            <strong>Positions:</strong> ESPN only lists each player's current position, so that's used for their whole
            career. Most players before 2012 don't have one, so position comparisons start in 2012.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How many games count</h2>
        <p>It depends on how many games the player's team played. In a 44-game season:</p>
        <ul className="about-list">
          <li>
            <strong>Under 11 games:</strong> outlined and not compared.
          </li>
          <li>
            <strong>11 to 19 games:</strong> a partial season. It's compared and colored, with an asterisk, but not
            ranked.
          </li>
          <li>
            <strong>20 or more games:</strong> a full season. It's ranked and counts toward the league and position
            averages.
          </li>
        </ul>
        <p>Shorter seasons scale down, so for example in 1997 teams played 28 games, so if a player played 13 games that was enough to be ranked (in 2026 you'd need 20).</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How many shots count</h2>
        <p>Shooting percentages also need enough shots behind them:</p>
        <ul className="about-list">
          <li>
            <strong>3-point %:</strong> 40 attempts to be colored; 60 attempts or 20 makes to be ranked.
          </li>
          <li>
            <strong>Field goal %:</strong> 100 attempts to be colored; 200 attempts or 85 makes to be ranked.
          </li>
          <li>
            <strong>True shooting %:</strong> 100 TS attempts (shots plus trips to the free-throw line) to be colored;
            125 to be ranked.
          </li>
        </ul>
        <p>The numbers to be ranked are for a 44-game season, and go down if the team played fewer games.</p>
      </section>

      <p className="text-muted" style={{ margin: "var(--space-10) 0 0", fontSize: "var(--fs-sm)", lineHeight: 1.5 }}>
        WNBA Arc is an independent, unofficial project. It isn't affiliated with or endorsed by the WNBA or ESPN. Team and
        player names and photos belong to their owners.
      </p>
    </main>
  );
}
