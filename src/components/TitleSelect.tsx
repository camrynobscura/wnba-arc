interface TitleSelectProps {
  /** The select's accessible name. There is no visible label: the chosen option IS the title. */
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

/** The title's type: the section-heading face and size (as the drill-down's h2 would be), inline
    because a class would lose to the `font: inherit` the select styles need. */
const TITLE_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontStretch: "condensed", // the stand-in's width, as in every heading rule (theme.css, --font-heading)
  fontWeight: "var(--font-heading-weight)" as React.CSSProperties["fontWeight"],
  fontSize: "var(--fs-2xl)",
  lineHeight: 1.1,
};

/**
 * A native `<select>` that is also a section's title — the drill-down's stat picker ("Points ▾"),
 * its only use. (It was `LabeledSelect`, built for the Season / Comparison window / Baseline
 * pickers; those are gone, and with them the visible label, the field look and disabled options —
 * craftsmanship review 4.2, 2026-09-26.)
 *
 * The VISIBLE title is a plain span in the heading face, and the native select lies over it,
 * invisible (opacity 0) and at the normal 14px. Two reasons over styling the select itself big:
 * (1) Safari renders the popup menu in the select's own font size and ignores any styling on
 * <option>, so a 28px select opened a 28px menu ("freaking huge"); (2) a native select is as wide
 * as its WIDEST option, so a short label had the chevron floating ~100px away — the span is
 * exactly as wide as its text. The select stays the real control: clicks on the title open the
 * native picker, and keyboard and screen readers get a select named by `ariaLabel`; the wrapper
 * draws the focus ring (:has(select:focus-visible)) and the chevron (theme.css `.select-wrap`).
 */
export function TitleSelect({ ariaLabel, value, options, onChange }: TitleSelectProps) {
  const currentLabel = options.find((o) => o.value === value)?.label ?? "";
  return (
    <span className="select-wrap is-title">
      <span aria-hidden="true" className="select-title-label" style={TITLE_FONT}>
        {currentLabel}
      </span>
      <select aria-label={ariaLabel} className="select-reset select-title" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
