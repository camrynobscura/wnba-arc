interface TitleSelectProps {
  /** The select's accessible name. There is no visible label: the chosen option IS the title. */
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

/** The title's type: the section-heading face and size, inline because a class would lose to the
    `font: inherit` the select styles need. */
const TITLE_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontStretch: "condensed", // the stand-in's width, as in every heading rule (theme.css, --font-heading)
  fontWeight: "var(--font-heading-weight)" as React.CSSProperties["fontWeight"],
  fontSize: "var(--fs-2xl)",
  lineHeight: 1.1,
};

/**
 * A native `<select>` that is also a section's title: the stat detail's stat picker ("Points ▾").
 *
 * The visible title is a span in the heading face, and the native select lies over it, invisible, at the
 * normal 14px. Two reasons not to style the select itself big: Safari renders the popup menu in the
 * select's own font size and ignores styling on <option>, so a 28px select opened a 28px menu; and a
 * native select is as wide as its widest option, so a short label had the chevron floating ~100px away.
 * The select stays the real control: a click on the title opens the native picker, keyboard and screen
 * readers get a select named by `ariaLabel`, and the wrapper draws the focus ring and the chevron
 * (theme.css `.select-wrap`).
 */
export function TitleSelect({ ariaLabel, value, options, onChange }: TitleSelectProps) {
  const currentLabel = options.find((o) => o.value === value)?.label ?? "";
  return (
    <span className="select-wrap is-title">
      <span aria-hidden="true" className="select-title-label" style={TITLE_FONT}>
        {currentLabel}
      </span>
      <select
        aria-label={ariaLabel}
        className="select-reset select-title"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
