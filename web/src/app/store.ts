import { useSyncExternalStore } from "react";
import type { RecordModel } from "pocketbase";
import type { TripSnapshot } from "../domain/types";
import { COLLECTIONS, loadSnapshot, mappers, pb, subscribeTrip, type TripCollection } from "../infra/pocketbase";

// App state: the trip snapshot plus sync status. Last good snapshot is cached for offline reading.

export interface AppState {
  readonly snapshot: TripSnapshot | null;
  readonly meId: string | null;
  readonly syncedAt: number | null;
  readonly online: boolean;
  readonly error: string | null;
}

const CACHE_KEY = "trip-cache-v1";
let state: AppState = { snapshot: null, meId: null, syncedAt: null, online: navigator.onLine, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ snapshot: state.snapshot, meId: state.meId, syncedAt: state.syncedAt }));
  } catch { /* storage full or blocked: offline copy just won't update */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { snapshot, meId, syncedAt } = JSON.parse(raw);
      set({ snapshot, meId, syncedAt });
    }
  } catch { /* ignore broken cache */ }
}

export function useApp(): AppState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

export const getState = () => state;

async function refresh() {
  try {
    const { snapshot, meId } = await loadSnapshot();
    set({ snapshot, meId, syncedAt: Date.now(), online: true, error: null });
    persist();
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) { signOut(); return; }
    set({ online: navigator.onLine && status !== 0, error: state.snapshot ? null : "일정을 불러오지 못했어요. 네트워크를 확인해 주세요." });
  }
}

function applyEvent(collection: TripCollection, action: string, record: RecordModel) {
  const snap = state.snapshot;
  if (!snap) return;
  const list = snap[collection] as readonly { id: string }[];
  const mapped = mappers[collection](record) as { id: string };
  const next = action === "delete"
    ? list.filter((x) => x.id !== record.id)
    : list.some((x) => x.id === record.id)
      ? list.map((x) => (x.id === record.id ? mapped : x))
      : [...list, mapped];
  set({ snapshot: { ...snap, [collection]: next }, syncedAt: Date.now() });
  persist();
}

let stopRealtime: (() => void) | null = null;

export async function start() {
  restore();
  if (!pb.authStore.isValid) return;
  await refresh();
  const tripId = state.snapshot?.trip.id;
  if (tripId && !stopRealtime) {
    try {
      stopRealtime = await subscribeTrip(tripId, applyEvent, refresh);
    } catch { /* realtime unavailable: pull on focus still works */ }
  }
}

export function signOut() {
  stopRealtime?.();
  stopRealtime = null;
  pb.authStore.clear();
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  set({ snapshot: null, meId: null, syncedAt: null, error: null });
}

window.addEventListener("online", () => { set({ online: true }); void refresh(); });
window.addEventListener("offline", () => set({ online: false }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && pb.authStore.isValid) void refresh();
});

// ---- writes: every change goes to the server; realtime brings it back to both phones ----

export class OfflineError extends Error {
  constructor() { super("오프라인이라 저장할 수 없어요. 연결되면 다시 해 주세요."); }
}

function guard() {
  if (!state.online || !navigator.onLine) throw new OfflineError();
  const tripId = state.snapshot?.trip.id;
  if (!tripId) throw new Error("NO_TRIP");
  return tripId;
}

export async function create(collection: TripCollection, data: Record<string, unknown>) {
  const trip = guard();
  const rec = await pb.collection(collection).create({ ...data, trip });
  applyEvent(collection, "create", rec);
  return rec.id;
}

export async function update(collection: TripCollection, id: string, data: Record<string, unknown>) {
  guard();
  const rec = await pb.collection(collection).update(id, data);
  applyEvent(collection, "update", rec);
}

export async function remove(collection: TripCollection, id: string) {
  guard();
  await pb.collection(collection).delete(id);
  applyEvent(collection, "delete", { id } as RecordModel);
}

/** Several order updates at once; the UI is updated optimistically first. */
export async function reorderRecords(collection: TripCollection, changes: readonly { id: string; order: number }[]) {
  if (changes.length === 0) return;
  guard();
  const snap = state.snapshot!;
  const byId = new Map(changes.map((c) => [c.id, c.order]));
  const list = (snap[collection] as readonly { id: string; order?: number }[]).map((x) => (byId.has(x.id) ? { ...x, order: byId.get(x.id)! } : x));
  set({ snapshot: { ...snap, [collection]: list } });
  await Promise.all(changes.map((c) => pb.collection(collection).update(c.id, { order: c.order })));
  persist();
}

export async function updateTrip(data: Record<string, unknown>) {
  guard();
  await pb.collection("trips").update(state.snapshot!.trip.id, data);
  await refresh();
}

export { COLLECTIONS };
