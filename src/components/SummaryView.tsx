import { photoUrl, type StatDef } from "../data/stats";
import type { PlayerDetail, PlayerSummary } from "../data/api";
import { PlayerSearch } from "./PlayerSearch";
import { type BaselineContext, type ComparisonTarget, type ComparisonWindow, type DeviationRow } from "../lib/deviation";
import { PlayerPhoto } from "./PlayerPhoto";
import { DeviationBlocks } from "./DeviationBlocks";
import { CareerHeatmap } from "./CareerHeatmap";
import { ScaleKey } from "./ScaleKey";
import { LabeledSelect } from "./Select";

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
  /** Full roster + its load error, for the in-row "search more players" box. */
  players: PlayerSummary[] | null;
  listError: string | null;
  onWinChange: (win: ComparisonWindow) => void;
  onTargetChange: (target: ComparisonTarget) => void;
  onSubjectYearChange: (year: number) => void;
  onGoHome: () => void;
  onOpenStat: (key: StatDef["key"]) => void;
  onPick: (espn: string) => void;
}

const WINDOW_LABEL: Record<ComparisonWindow, string> = {
  career: "Career",
  last5: "Last 5 years",
  last1: "Last year",
};

export function SummaryView({
  player,
  ctx,
  rows,
  caption,
  players,
  listError,
  onWinChange,
  onTargetChange,
  onSubjectYearChange,
  onGoHome,
  onOpenStat,
  onPick,
}: SummaryViewProps) {
  const {
    subject,
    league,
    effectiveTarget,
    effectiveWindow,
    fallbackActive,
    ownAvailable,
    windowAvailable,
    selectableYears,
    nonSelectableSmallSample,
    missedSeasons,
  } = ctx;
  // Group missed (no-data) seasons by reason so a player with several gaps gets one
  // compact line ("No seasons on record for 2019, 2021–2024") rather than many.
  const missedByReason = new Map<string, number[]>();
  for (const m of missedSeasons) {
    const reason = (m.reason || "did not play").toLowerCase();
    missedByReason.set(reason, [...(missedByReason.get(reason) ?? []), m.year]);
  }
  const missedGroups = [...missedByReason.entries()];
  // Only full (non-small-sample) seasons are offered; the context handles the fallback.
  const years = selectableYears;

  return (
    <main id="main" style={{ maxWidth: "var(--app-width)", width: "100%", margin: "0 auto", padding: "18px 20px 16px" }}>
      {/* Top row: back to all players (left) + jump straight to another player (right). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <button className="btn btn-ghost" style={{ gap: 8 }} onClick={onGoHome}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>All players</span>
        </button>
        <PlayerSearch variant="compact" players={players} listError={listError} onPick={onPick} />
      </div>

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
        {/* Season picker — the prominent control (bold heading font); it drives the bars. */}
        <div className="sb-picker">
          <LabeledSelect
            label="Season"
            id="season-select"
            value={String(subject.year)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(v) => onSubjectYearChange(Number(v))}
            selectStyle={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15 }}
          />
        </div>

        {/* Comparison window + baseline, with the caption of what's compared under them.
            An unavailable window (one that would collapse to a narrower one — the distinctness
            rule) is passed as a disabled option so it still shows but can't be chosen. */}
        <div className="sb-compare">
          <div className="sb-segs">
            <LabeledSelect
              label="Comparison window"
              value={effectiveWindow}
              options={(Object.keys(WINDOW_LABEL) as ComparisonWindow[]).map((w) => ({
                value: w,
                label: WINDOW_LABEL[w],
                disabled: !windowAvailable[w],
              }))}
              onChange={(v) => onWinChange(v as ComparisonWindow)}
            />
            <LabeledSelect
              label="Baseline"
              value={effectiveTarget}
              options={[
                { value: "own", label: "Their own", disabled: !ownAvailable },
                { value: "league", label: "League avg" },
              ]}
              onChange={(v) => onTargetChange(v as ComparisonTarget)}
            />
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

      {(nonSelectableSmallSample.length > 0 || missedGroups.length > 0) && (
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
          {nonSelectableSmallSample.length > 0 && (
            <div>
              <strong style={{ fontWeight: 600 }}>
                {compressYears(nonSelectableSmallSample.map((s) => s.year))} not shown
              </strong>{" "}
              — too few games played.
            </div>
          )}
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

      {/* Same diverging gradient key as the Career Trend heatmap, placed identically —
          left-aligned directly above the bars it describes. */}
      <div className="scale-legend" style={{ marginTop: 18, marginBottom: 10 }}>
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
