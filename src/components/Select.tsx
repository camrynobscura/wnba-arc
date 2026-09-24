import { useId } from "react";

export interface SelectOption {
  value: string;
  label: string;
  /** Rendered greyed and unselectable — used for comparison windows that aren't offered. */
  disabled?: boolean;
}

interface LabeledSelectProps {
  /** Visible label rendered above the control (via `.field > label`). */
  label?: string;
  /** Accessible name when there is no visible label (e.g. the drill-down's inline control). */
  ariaLabel?: string;
  /** Explicit id to tie a visible label to; auto-generated when omitted. */
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Extra styles on the `<select>` (e.g. a more prominent font for the season picker). */
  selectStyle?: React.CSSProperties;
  /** "title": the select IS a section title — headline face, no box until hovered / focused, a
      bigger chevron (the drill-down's stat picker, which doubles as its heading). */
  variant?: "field" | "title";
}

/** The title variant's type: the section-heading face and size (h2 in the drill-down), inline
    because `.input`'s `font: inherit` would beat a class. */
const TITLE_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: "var(--font-heading-weight)" as React.CSSProperties["fontWeight"],
  fontSize: "var(--fs-2xl)",
  lineHeight: 1.1,
};

/**
 * A styled native `<select>` with the app's custom chevron (`.select-wrap` / `.select-reset`),
 * shared by the Season / Comparison window / Baseline pickers. A native select stays fully
 * keyboard- and screen-reader-accessible for free, and — unlike a segmented control — scales to
 * three-plus options without crowding the 600px column. Unavailable options are passed as
 * `disabled` so they still show (discoverable) but can't be chosen.
 */
export function LabeledSelect({ label, ariaLabel, id, value, options, onChange, selectStyle, variant = "field" }: LabeledSelectProps) {
  const genId = useId();
  const selectId = id ?? genId;
  const title = variant === "title";
  // Title variant: the VISIBLE title is a plain span in the heading face, and the native <select>
  // lies over it, invisible (opacity 0) and at the normal 14px. Two reasons over styling the
  // select itself big: (1) Safari renders the popup menu in the select's own font size and
  // ignores any styling on <option>, so a 28px select opened a 28px menu ("freaking huge"); (2) a
  // native select is as wide as its WIDEST option, so a short label had the chevron floating
  // ~100px away — the span is exactly as wide as its text. The select stays the real control:
  // clicks on the title open the native picker, keyboard and screen readers get a select named
  // "Stat"; the wrapper draws the focus ring (:has(select:focus-visible)) and the chevron.
  const currentLabel = options.find((o) => o.value === value)?.label ?? "";
  return (
    <div className="field" style={{ margin: 0 }}>
      {label && <label htmlFor={selectId}>{label}</label>}
      <span className={"select-wrap" + (title ? " is-title" : "")}>
        {title && (
          <span aria-hidden="true" className="select-title-label" style={TITLE_FONT}>
            {currentLabel}
          </span>
        )}
        <select
          id={selectId}
          aria-label={label ? undefined : ariaLabel}
          // Font kept via inline `selectStyle` (not a class): `.input` sets `font: inherit`,
          // which lands later in the cascade and would override a class-set font.
          className={title ? "select-reset select-title" : "input select-reset"}
          style={title ? undefined : { width: "auto", ...selectStyle }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
