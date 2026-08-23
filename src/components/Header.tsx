import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  onGoHome: () => void;
  onAbout: () => void;
}

export function Header({ onGoHome, onAbout }: HeaderProps) {
  return (
    <header
      className="nav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-divider)",
      }}
    >
      <button
        className="nav-brand"
        aria-label="ARC WNBA — back to all players"
        style={{
          appearance: "none",
          background: "transparent",
          border: 0,
          font: "inherit",
          color: "inherit",
          padding: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          cursor: "pointer",
        }}
        onClick={onGoHome}
      >
        <span>ARC WNBA</span>
        <span
          className="text-muted"
          style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--font-body)", fontWeight: 400 }}
        >
          · season vs. baseline
        </span>
      </button>
      <button
        type="button"
        className="theme-toggle"
        onClick={onAbout}
        aria-label="About ARC"
        title="About ARC"
      >
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      <ThemeToggle />
    </header>
  );
}
