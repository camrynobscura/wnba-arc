import { aboveLabel, ordinal, type CareerSummary as Summary, type HeatmapMode } from "../lib/deviation";

interface CareerSummaryProps {
  summary: Summary;
  /** The word after the number ("14.3 points"); empty for a shooting %, which shows the bare "34.6%". */
  unit: string;
  mode: HeatmapMode;
}

/**
 * The career at a glance for one stat: a row of "plates" — high, low, career average, seasons
 * above the reference, best league rank — each a bordered cell with its label sitting on the
 * border. A definition list: the label is the term, the number and its note the definitions.
 * Chosen over tiles, stat lines, a range strip and prose on a side-by-side preview (DECISIONS,
 * 2026-09-18); the plates are equal-width and the labels are kept short enough never to wrap.
 */
export function CareerSummary({ summary: s, unit, mode }: CareerSummaryProps) {
  const plates: { k: string; v: string; u?: string; q?: string; n: string }[] = [
    { k: "High", v: s.high.fmt, u: unit, n: String(s.high.year) },
    { k: "Low", v: s.low.fmt, u: unit, n: String(s.low.year) },
    { k: "Career avg", v: s.careerAvg, u: unit, n: `${s.seasons} season${s.seasons === 1 ? "" : "s"}` },
  ];
  if (s.above) plates.push({ k: aboveLabel(mode), v: String(s.above.n), q: `of ${s.above.of}`, n: "seasons" });
  // "WNBA 2026" not "2026 in the league": the plate is ~100px wide and the long form wrapped; the
  // league is still named, since the rank is a league rank whatever the compare mode.
  if (s.bestRank) plates.push({ k: "Best rank", v: ordinal(s.bestRank.rank), q: `of ${s.bestRank.pool}`, n: `WNBA ${s.bestRank.year}` });

  return (
    <dl className="cs" aria-label="Career summary">
      {plates.map((p) => (
        <div className="cs-plate" key={p.k}>
          <dt className="cs-k">{p.k}</dt>
          {/* The word after a number ("points", "of 158") is one treatment, whichever kind it is. Explicit
              spaces so a screen reader says "14.3 points" / "1st of 158", not one run-on token. */}
          <dd className="cs-v">
            {p.v}
            {p.u && (
              <>
                {/* "35%" has no space before its sign; "1.9 steals" has a word space. */}
                {p.u === "%" ? "" : " "}
                <span className="cs-q">{p.u}</span>
              </>
            )}
            {p.q && (
              <>
                {" "}
                <span className="cs-q">{p.q}</span>
              </>
            )}
          </dd>
          <dd className="cs-n">{p.n}</dd>
        </div>
      ))}
    </dl>
  );
}
