import { ordinal, type CareerSummary as Summary } from "../lib/deviation";

interface CareerSummaryProps {
  summary: Summary;
  /** The word after the number, in full ("points"; "%" for a shooting %) — what a screen reader hears. */
  unit: string;
  /** The same word as printed ("PTS"). When it differs from `unit`, the short form is shown and
      hidden from assistive tech, and the full word is given to it instead: "14.3 PTS" on screen,
      "14.3 points" spoken (a code like "STL" is read letter by letter otherwise). */
  unitShort: string;
  /** Whose rank the Best-rank plate holds: "WNBA" (the league) or the position ("Forwards"). */
  rankAmong: string;
}

/**
 * The career at a glance for one stat: a row of "plates" — high, low, career average, best league
 * rank — each a bordered cell with its label sitting on the border. A description list: the label is the name, and
 * the number WITH its note ("26.9 points", "2024") is the one value. They were two <dd>s until 2026-09-29, but the
 * spec says "the values within a group are alternatives" — the year isn't another answer to "High", it's part of
 * the answer (and VoiceOver counted every <dt> and <dd>: "High, 1 of 12").
 * Chosen over tiles, stat lines, a range strip and prose on a side-by-side preview (DECISIONS,
 * 2026-09-18); the plates are equal-width and the labels are kept short enough never to wrap.
 */
export function CareerSummary({ summary: s, unit, unitShort, rankAmong }: CareerSummaryProps) {
  // `said`: the label as a screen reader should say it, where the short printed one reads badly ("avg").
  const plates: { k: string; said?: string; v: string; u?: string; q?: string; n: string }[] = [
    { k: "High", v: s.high.fmt, u: unit, n: String(s.high.year) },
    { k: "Low", v: s.low.fmt, u: unit, n: String(s.low.year) },
    { k: "Career avg", said: "Career average", v: s.careerAvg, u: unit, n: `${s.seasons} season${s.seasons === 1 ? "" : "s"}` },
  ];
  // "WNBA 2026" / "Forwards 2026", not "2026 in the league": the plate is ~100px wide and the long
  // form wrapped; the crowd is still named — the rank follows the compare mode.
  if (s.bestRank) plates.push({ k: "Best rank", v: ordinal(s.bestRank.rank), q: `of ${s.bestRank.pool}`, n: `${rankAmong} ${s.bestRank.year}` });

  return (
    <>
      {/* Names the plates for screen readers: a heading they can jump to (a native element — the
          aria-label this list used to carry is ignored on a <dl>, which has no role that takes a
          name). Hidden: on screen the plates speak for themselves. */}
      <h3 className="sr-only">Career summary</h3>
      <dl className="cs">
        {plates.map((p) => (
          <div className="cs-plate" key={p.k}>
            {/* The label is drawn in capitals (CSS), and Safari hands VoiceOver the capitals: "LOW" was spelled
                out letter by letter (user, 2026-09-29). So the drawn label is hidden from it and a plain copy
                is read instead ("Low", "Career average"). */}
            <dt className="cs-k">
              <span aria-hidden="true">{p.k}</span>
              <span className="sr-only">{p.said ?? p.k}</span>
            </dt>
            {/* One value: the number, then its note, with a spoken pause between ("26.9 points, 2024"). */}
            <dd className="cs-d">
              {/* The word after a number ("points", "of 158") is one treatment, whichever kind it is. Explicit
                  spaces so a screen reader says "14.3 points" / "1st of 158", not one run-on token. */}
              <span className="cs-v">
                {p.v}
                {p.u && (
                  <>
                    {/* "35%" has no space before its sign; "1.9 STL" has a word space. */}
                    {p.u === "%" ? "" : " "}
                    {unitShort === p.u ? (
                      <span className="cs-q">{p.u}</span>
                    ) : (
                      <>
                        <span className="cs-q" aria-hidden="true">{unitShort}</span>
                        <span className="sr-only">{p.u}</span>
                      </>
                    )}
                  </>
                )}
                {p.q && (
                  <>
                    {" "}
                    <span className="cs-q">{p.q}</span>
                  </>
                )}
              </span>
              <span className="sr-only">, </span>
              <span className="cs-n">{p.n}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
