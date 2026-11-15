import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

// New deploys reach open phones quickly: check on resume and every 5 minutes, then reload
// unless someone is typing in a sheet (then offer the update instead of losing their input).

const CHECK_EVERY_MS = 5 * 60 * 1000;
let pending = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const isEditing = () => document.querySelector(".sheet") !== null;

export function startUpdater() {
  if (!("serviceWorker" in navigator)) return;
  registerSW({
    immediate: true,
    onNeedReload() {
      if (isEditing()) { pending = true; notify(); }
      else window.location.reload();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) void reg.update().catch(() => { /* offline or server down: try later */ }); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    },
  });
}

export function applyUpdate() {
  window.location.reload();
}

export function useUpdatePending(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => pending);
}
