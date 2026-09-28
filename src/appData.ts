import { createContext, useContext } from "react";
import type { Meta, PlayerSummary } from "./data/api";
import type { League, PositionLookup } from "./lib/deviation";

/** App-wide data loaded once at startup and shared with every route via context. The
 *  per-player detail is NOT here — it's fetched per route in PlayerLayout, keyed on the URL. */
export interface AppData {
  players: PlayerSummary[] | null;
  /** The player list or the league averages failed to load (no retry: a refresh starts over). */
  loadFailed: boolean;
  league: League | null;
  positions: PositionLookup | null;
  /** GET /meta — data freshness for the footer; null until loaded (or if the fetch failed). */
  meta: Meta | null;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within <App>");
  return ctx;
}
