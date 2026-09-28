/**
 * Theme resolution — pure helpers, no React.
 *
 * The resolved theme is stamped on <html data-theme="…">; the CSS in theme.css
 * keys the dark palette off that attribute. localStorage holds the user's
 * *explicit* choice, or nothing while they're following the OS. A blocking
 * script in index.html applies the initial value before first paint (no flash);
 * these helpers keep it in sync afterwards and back the toggle.
 */
export type Theme = "light" | "dark";

const KEY = "arc-theme";

/** The user's explicit choice, or null if they haven't chosen (follow the OS). */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** The OS preference. */
export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** What's actually in effect now: an explicit choice wins over the OS. */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Each theme's page background (theme.css `--color-bg`), for the browser bar's `theme-color`. index.html's
    pre-paint script repeats the two values; theme.test.ts checks all three places agree. */
export const THEME_COLOR: Record<Theme, string> = { light: "#f2f2f3", dark: "#17191e" };

/** Stamp the attribute the CSS reads, and give the browser bar the page's color. */
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
}

/** Persist an explicit choice and apply it. */
export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode / storage disabled — the in-page apply below still works */
  }
  applyTheme(t);
}
