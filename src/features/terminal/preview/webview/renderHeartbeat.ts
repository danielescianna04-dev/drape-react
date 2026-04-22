/**
 * Module-level singleton for the latest DOM-mutation timestamp reported by
 * the preview WebView's heartbeat script. Used by the reload-banner logic
 * to decide whether HMR already applied a file change (mutation arrived
 * shortly after the change) or whether the user should be prompted to
 * reload manually.
 *
 * A module-level ref is fine here because only one preview is live at a
 * time — switching projects unmounts the WebView and the next load
 * re-installs the heartbeat, resetting the clock.
 */

let lastRenderAt = 0;
type Listener = (at: number) => void;
const listeners = new Set<Listener>();

export const renderHeartbeat = {
  record(at: number) {
    if (at > lastRenderAt) lastRenderAt = at;
    for (const fn of listeners) fn(at);
  },
  lastAt(): number {
    return lastRenderAt;
  },
  reset() {
    lastRenderAt = 0;
  },
  /**
   * Subscribe to heartbeat updates. Useful for "auto-dismiss the banner
   * if HMR catches up late" — caller can observe the late mutation and
   * react without polling.
   */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
