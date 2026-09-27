import { useEffect, useState } from "react";
import { applyTheme, resolveTheme, setTheme, storedTheme, systemTheme, type Theme } from "../lib/theme";

/**
 * The footer's light/dark switch. Seeds from the resolved theme (OS preference until the
 * user picks one), then persists an explicit choice. While no choice is stored it
 * keeps following the OS live, so changing the system theme still flips the app.
 */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  // Follow the OS while the user hasn't made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (storedTheme() == null) {
        const t = systemTheme();
        setThemeState(t);
        applyTheme(t);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next); // persist + stamp <html data-theme>
    setThemeState(next);
  };

  const next = theme === "dark" ? "light" : "dark";
  // Named by its `title` alone (the hover tooltip): an equal aria-label was read twice (a11y review R3).
  return (
    <button type="button" className="icon-btn" onClick={toggle} title={`Switch to ${next} mode`}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/* Icons show the theme you'd switch TO: a sun while dark, a moon while light. */
function SunIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
    </svg>
  );
}
