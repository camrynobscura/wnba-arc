import { photoUrl, type StatDef } from "../data/stats";
import type { PlayerDetail } from "../data/api";
import { playedSeasons, type BaselineContext, type ComparisonTarget, type ComparisonWindow, type DeviationRow } from "../lib/deviation";
import { PlayerPhoto } from "./PlayerPhoto";
import { DeviationBlocks } from "./DeviationBlocks";
import { CareerHeatmap } from "./CareerHeatmap";
import { ScaleKey } from "./ScaleKey";

/** "2019, 2021–2024" — collapse consecutive years into ranges for a compact list. */
function compressYears(years: number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = sorted[i];
  }
  return parts.join(", ");
}

interface SummaryViewProps {
  player: PlayerDetail;
  ctx: BaselineContext;
  rows: DeviationRow[];
  caption: string;
  onWinChange: (win: ComparisonWindow) => void;
  onTargetChange: (target: ComparisonTarget) => void;
  onSubjectYearChange: (year: number) => void;
  onGoHome: () => void;
  onOpenStat: (key: StatDef["key"]) => void;
}

const WINDOW_LABEL: Record<ComparisonWindow, string> = {
  career: "Career",
  last5: "Last 5 years",
  last1: "Last year",
};

// A <fieldset> groups the radios so the group has an accessible name (its <legend>),
// but its default chrome (border/padding/min-inline-size) must be reset to keep the layout.
const fieldsetReset: React.CSSProperties = { margin: 0, padding: 0, border: 0, minInlineSize: 0 };
// Match the look of `.field > label` (which no longer applies to a <legend>).
const legendStyle: React.CSSProperties = {
  padding: 0,
  fontSize: 12,
  marginBottom: 5,
  color: "color-mix(in srgb, var(--color-text) 70%, transparent)",
};

export function SummaryView({
  player,
  ctx,
  rows,
  caption,
  onWinChange,
  onTargetChange,
  onSubjectYearChange,
  onGoHome,
  onOpenStat,
}: SummaryViewProps) {
  const {
    subject,
    league,
    effectiveTarget,
    effectiveWindow,
    fallbackActive,
    ownAvailable,
    windowAvailable,
    scheduled,
    subjectSmallSample,
    skippedSmallSampleSeasons,
    missedSeasons,
  } = ctx;
  // Skipped-baseline note only makes sense when baselines ARE her own seasons.
  const skipped = effectiveTarget === "own" ? skippedSmallSampleSeasons : [];
  // Group missed (no-data) seasons by reason so a player with several gaps gets one
  // compact line ("No seasons on record for 2019, 2021–2024") rather than many.
  const missedByReason = new Map<string, number[]>();
  for (const m of missedSeasons) {
    const reason = (m.reason || "did not play").toLowerCase();
    missedByReason.set(reason, [...(missedByReason.get(reason) ?? []), m.year]);
  }
  const missedGroups = [...missedByReason.entries()];
  const years = playedSeasons(player).map((s) => s.year).reverse();

  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "18px 20px 16px" }}>
      <button className="btn btn-ghost" style={{ marginBottom: 18, gap: 8 }} onClick={onGoHome}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span>All players</span>
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingBottom: 16,
          marginBottom: 14,
          borderBottom: "2px solid var(--color-divider)",
        }}
      >
        <PlayerPhoto src={photoUrl(player.espn)} name={player.name} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-kicker" style={{ marginBottom: 3 }}>
            {player.team} · {player.pos} · #{player.jersey}
          </div>
          <h1 style={{ fontSize: 27, margin: 0, lineHeight: 1 }}>{player.name}</h1>
        </div>
      </div>

      <CareerHeatmap player={player} league={league} subjectYear={subject.year} />

      <h2 style={{ fontSize: 20, margin: "0 0 14px" }}>Season Breakdown</h2>

      {/* Controls (.sb-* in theme.css). Desktop: comparison controls left, season picker
          right. Mobile: a single left-aligned column — season+games first (it's first in
          the DOM; row-reverse flips it to the right on desktop), then the compare controls. */}
      <div className="sb-controls">
        {/* Season picker (labelled like the comparison controls) + that season's games-played. */}
        <div className="sb-picker">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="season-select">Season</label>
            <span className="select-wrap">
              <select
                id="season-select"
                // Font kept inline (not .text-heading): the .input class sets `font: inherit`,
                // which is later in the cascade and would override a class-set font-family.
                className="input select-reset"
                style={{ width: "auto", fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15 }}
                value={subject.year}
                onChange={(e) => onSubjectYearChange(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="sb-games">
            <span className="text-heading" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
              {subject.gp} of {scheduled}{" "}
              <span className="text-muted" style={{ fontSize: 13, fontWeight: 400 }}>games played</span>
            </span>
            {subjectSmallSample && (
              <span className="tag tag-neutral" title="Below 25% of the season — treated as a small sample and left out of baselines.">
                small sample
              </span>
            )}
          </div>
        </div>

        {/* Comparison window + baseline, with the caption of what's compared under them. */}
        <div className="sb-compare">
          <div className="sb-segs">
            <fieldset className="field" style={fieldsetReset}>
              <legend style={legendStyle}>Comparison window</legend>
              <div className="seg">
                {(Object.keys(WINDOW_LABEL) as ComparisonWindow[]).map((w) => (
                  <label key={w} className="seg-opt" style={{ opacity: windowAvailable[w] ? 1 : 0.4 }}>
                    <input
                      type="radio"
                      name="win"
                      value={w}
                      checked={effectiveWindow === w}
                      disabled={!windowAvailable[w]}
                      onChange={() => onWinChange(w)}
                    />
                    <span>{WINDOW_LABEL[w]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="field" style={fieldsetReset}>
              <legend style={legendStyle}>Baseline</legend>
              <div className="seg">
                <label className="seg-opt" style={{ opacity: ownAvailable ? 1 : 0.4 }}>
                  <input type="radio" name="tgt" value="own" checked={effectiveTarget === "own"} disabled={!ownAvailable} onChange={() => onTargetChange("own")} />
                  <span>Their own</span>
                </label>
                <label className="seg-opt">
                  <input type="radio" name="tgt" value="league" checked={effectiveTarget === "league"} onChange={() => onTargetChange("league")} />
                  <span>League avg</span>
                </label>
              </div>
            </fieldset>
          </div>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            {caption}
          </p>
        </div>
      </div>
      {fallbackActive && (
        <span className="tag tag-accent" style={{ marginBottom: 8 }}>
          Using league average — no prior season to compare against yet
        </span>
      )}

      {(skipped.length > 0 || missedGroups.length > 0) && (
        <div
          role="note"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            margin: "10px 0 4px",
            padding: "10px 12px",
            fontSize: 12.5,
            lineHeight: 1.4,
            color: "var(--color-neutral-700)",
            background: "color-mix(in srgb, var(--color-text) 3.5%, transparent)",
            borderLeft: "2px solid var(--color-divider)",
            borderRadius: "0 var(--radius-md) var(--radius-md) 0",
          }}
        >
          {skipped.map((s) => (
            <div key={`ss-${s.year}`}>
              <strong style={{ fontWeight: 600 }}>{s.year} isn't used as a baseline</strong> — small sample (
              {s.gp} of {ctx.league.scheduled(s.year)} games played).
            </div>
          ))}
          {missedGroups.map(([reason, years]) => (
            <div key={`ms-${reason}`}>
              <strong style={{ fontWeight: 600 }}>
                {years.length === 1 ? `No ${years[0]} season on record` : `No seasons on record for ${compressYears(years)}`}
              </strong>{" "}
              — {reason}.
            </div>
          ))}
        </div>
      )}

      {/* Same diverging gradient key as the Career Trend heatmap, right-aligned above the
          bars — the bars now gradate, so a matching scale reads more consistently than swatches. */}
      <div style={{ width: 240, maxWidth: "100%", marginLeft: "auto", marginTop: 18, marginBottom: 6 }}>
        <ScaleKey noun="baseline" />
      </div>

      <div style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 14, paddingBottom: 10 }}>
        {rows.map((row, idx) => (
          <button
            key={row.key}
            className="btn-reset row-hover"
            aria-label={`${row.label} — open year-by-year history`}
            style={{
              textAlign: "left",
              width: "100%",
              display: "grid",
              // Side columns sized tight to their content (label / number) so the bar
              // track (1fr) spreads as wide as possible in both directions. Columns are
              // uniform across rows so every bar's center baseline stays vertically aligned.
              // Label column is wide enough to keep the longest label ("True Shooting %")
              // on one line in the condensed heading font.
              gridTemplateColumns: "120px 1fr 56px",
              alignItems: "center",
              gap: 10,
              padding: "14px 8px",
              borderBottom: "1px solid var(--color-divider)",
            }}
            onClick={() => onOpenStat(row.key)}
          >
            <div style={{ lineHeight: 1.05 }}>
              <div className="text-heading" style={{ fontSize: 19 }}>{row.label}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                baseline {row.baseFmt}
              </div>
            </div>
            {/* A little breathing room between the label and where the bar track starts. */}
            <div style={{ paddingLeft: 12 }}>
              <DeviationBlocks up={row.up} barPct={row.barPct} barColor={row.barColor} showBaselineLabel={idx === 0} />
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.05 }}>
              <span className="text-heading" style={{ fontSize: 19 }}>{row.curFmt}</span>
              <span style={{ fontSize: 11, color: row.deltaColor }}>{row.rawFmt}</span>
            </div>
          </button>
        ))}
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: 16 }}>
        Bars show each stat's distance from its baseline (full bar = 50% above/below). Click a stat for its year-by-year history →
      </p>
    </main>
  );
}
