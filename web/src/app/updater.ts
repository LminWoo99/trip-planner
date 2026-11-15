import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

// New deploys are fetched in the background (on resume and every 5 minutes) and then wait.
// The app never reloads by itself: a banner offers the update and applies it only on tap.

const CHECK_EVERY_MS = 5 * 60 * 1000;
let pending = false;
let apply: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function startUpdater() {
  if (!("serviceWorker" in navigator)) return;
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      notify();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) void reg.update().catch(() => { /* offline or server down: try later */ }); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    },
  });
}

/** Activates the waiting version and reloads once — only when the user asks for it. */
export function applyUpdate() {
  if (apply) void apply(true);
  else window.location.reload();
}

export function useUpdatePending(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => pending);
}
