import { useSyncExternalStore } from "react";

/**
 * What a visitor can do about a failed load, in their words. The raw error goes to the console.
 *
 * The offline line is used only when the browser is sure it's offline: `navigator.onLine` false is
 * reliable, true isn't (to `fetch`, a server that's down looks the same as a dropped connection), so
 * every other failure gets the general line rather than a guess at the cause.
 */
export const OFFLINE_HINT = "You're offline. Check your connection, then refresh the page.";
export const RETRY_HINT = "Try refreshing the page in a minute.";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** False while the browser reports no connection. Live, so an error's line switches from the offline
    one to the general one when the connection comes back. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
