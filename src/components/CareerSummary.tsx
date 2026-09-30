import { ordinal, yearList, type CareerSummary as Summary } from "../lib/deviation";
import { InfoTip } from "./InfoTip";

interface CareerSummaryProps {
  summary: Summary;
  /** The word after the number, in full ("points"; "%" for a shooting %): what a screen reader hears. */
  unit: string;
  /** The same word as printed ("PTS"). When it differs from `unit`, the short form is shown and
      hidden from assistive tech, and the full word is given to it instead: "14.3 PTS" on screen,
      "14.3 points" spoken (a code like "STL" is read letter by letter otherwise). */
  unitShort: string;
  /** Whose rank the Best-rank plate holds: "WNBA" (the league) or the position ("Forwards"). */
  rankAmong: string;
}

/**
 * The career at a glance for one stat: high, low, career average and best rank, as a row of bordered
 * plates with each label sitting on its border. A description list with one value per label: the number
 * with its note ("26.9 points, 2024"). The year isn't a second answer to "High" but part of the answer,
 * and the HTML spec says the values in a group are alternatives. The labels are kept short enough never
 * to wrap.
 */
export function CareerSummary({ summary: s, unit, unitShort, rankAmong }: CareerSummaryProps) {
  // `said`: the label as a screen reader should say it, where the short printed one reads badly ("avg").
  // `more`: a tooltip after the note, for what the plate has no room to list.
  const plates: {
    k: string;
    said?: string;
    v: string;
    u?: string;
    q?: string;
    n: string;
    more?: { label: string; tip: string };
  }[] = [
    { k: "High", v: s.high.fmt, u: unit, n: String(s.high.year) },
    { k: "Low", v: s.low.fmt, u: unit, n: String(s.low.year) },
    {
      k: "Career avg",
      said: "Career average",
      v: s.careerAvg,
      u: unit,
      n: `${s.seasons} season${s.seasons === 1 ? "" : "s"}`,
    },
  ];
  // "WNBA 2026" / "Forwards 2026": a plate is ~100px wide and a longer form wrapped. The crowd is named
  // because the rank follows the comparison mode. The same rank in other seasons is a count ("+5") whose
  // tooltip names the years.
  if (s.bestRank) {
    const { rank, pool, year, alsoYears } = s.bestRank;
    plates.push({
      k: "Best rank",
      v: ordinal(rank),
      q: `of ${pool}`,
      n: `${rankAmong} ${year}`,
      more: alsoYears.length
        ? { label: `+${alsoYears.length}`, tip: `Also ${ordinal(rank)} in ${yearList(alsoYears)}` }
        : undefined,
    });
  }

  return (
    <>
      {/* A heading for screen readers to jump to (an aria-label is ignored on a <dl>, which has no role that
          takes a name). Hidden: on screen the plates speak for themselves. */}
      <h3 className="sr-only">Career summary</h3>
      <dl className="cs">
        {plates.map((p) => (
          <div className="cs-plate" key={p.k}>
            {/* The label is drawn in capitals (CSS), and Safari hands VoiceOver the capitals, so "LOW" was
                spelled out letter by letter. The drawn label is hidden from it and a plain copy is read
                instead ("Low", "Career average"). */}
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
                        <span className="cs-q" aria-hidden="true">
                          {unitShort}
                        </span>
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
              <span className="cs-n">
                {p.n}
                {p.more && (
                  <>
                    {" "}
                    <InfoTip label={p.more.label} tip={p.more.tip} />
                  </>
                )}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
