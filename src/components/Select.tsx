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
}

/**
 * A styled native `<select>` with the app's custom chevron (`.select-wrap` / `.select-reset`),
 * shared by the Season / Comparison window / Baseline pickers. A native select stays fully
 * keyboard- and screen-reader-accessible for free, and — unlike a segmented control — scales to
 * three-plus options without crowding the 600px column. Unavailable options are passed as
 * `disabled` so they still show (discoverable) but can't be chosen.
 */
export function LabeledSelect({ label, ariaLabel, id, value, options, onChange, selectStyle }: LabeledSelectProps) {
  const genId = useId();
  const selectId = id ?? genId;
  return (
    <div className="field" style={{ margin: 0 }}>
      {label && <label htmlFor={selectId}>{label}</label>}
      <span className="select-wrap">
        <select
          id={selectId}
          aria-label={label ? undefined : ariaLabel}
          // Font kept via inline `selectStyle` (not a class): `.input` sets `font: inherit`,
          // which lands later in the cascade and would override a class-set font.
          className="input select-reset"
          style={{ width: "auto", ...selectStyle }}
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
