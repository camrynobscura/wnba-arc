/**
 * The app's typefaces: one entry per face the pages draw (found by opening every page and state and listing the
 * font files the browser used). src/styles/fonts.css declares exactly these (fonts.test.ts checks); a new weight
 * goes in both.
 *
 * `preload`: the first screen of every page draws it (the home page's heading and names, the player page's top row),
 * so index.html preloads its Latin file (vite.config.ts) and it's there when the app first draws. The rest show up
 * later (a player's stats, the search results, the About page), so the app asks for them as it starts
 * (`loadLaterFonts`, main.tsx). Preloading all six made a slow phone's first paint ~370 ms later than preloading
 * these three, for no gain (Lighthouse's mobile profile).
 *
 * Plain TypeScript, no browser globals: the build config imports it too.
 */
export const APP_FONTS = [
  { family: "Barlow", weight: 400, preload: true },
  { family: "Barlow", weight: 500, preload: true },
  { family: "Barlow", weight: 600, preload: false },
  { family: "Barlow", weight: 700, preload: false },
  { family: "Barlow Condensed", weight: 500, preload: false },
  { family: "Barlow Condensed", weight: 600, preload: true },
] as const;

export type AppFont = (typeof APP_FONTS)[number];

/** The face's @fontsource package: `barlow`, `barlow-condensed`. */
export function fontPackage(font: AppFont): string {
  return font.family.toLowerCase().replace(/ /g, "-");
}

/** The face's file in its package, e.g. `barlow-condensed-latin-600-normal.woff2`. */
export function fontFile(font: AppFont, subset: "latin" | "latin-ext" | "vietnamese", format: "woff2" | "woff"): string {
  return `${fontPackage(font)}-${subset}-${font.weight}-normal.${format}`;
}

/**
 * Starts downloading the faces that aren't preloaded (their Latin files: the space a `load()` measures with is
 * Latin), so they're ready before the text that uses them appears. Pass `document.fonts`. A face that fails to
 * load isn't an error here: its text shows in the stand-in after 3 s (fonts.css), as it would without this.
 */
export function loadLaterFonts(fonts: { load(font: string): Promise<unknown> }): void {
  for (const f of APP_FONTS) {
    if (!f.preload) fonts.load(`${f.weight} 1em "${f.family}"`).catch(() => {});
  }
}
