import { createContext, useContext } from "react";
import type { PlayerSummary } from "./data/api";
import type { League, PositionLookup } from "./lib/deviation";

/** App-wide data loaded once at startup and shared with every route via context. The
 *  per-player detail is NOT here — it's fetched per route in PlayerLayout, keyed on the URL. */
export interface AppData {
  players: PlayerSummary[] | null;
  loadError: string | null;
  league: League | null;
  positions: PositionLookup | null;
  lastScrapedAt: string | null;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within <App>");
  return ctx;
}
