import { useSyncExternalStore } from "react";
import type { RecordModel } from "pocketbase";
import type { TripSnapshot } from "../domain/types";
import type { TripSummary } from "../domain/trips";
import { changeTripDates, COLLECTIONS, createTrip, deleteTrip, listTrips, loadSnapshot, mappers, pb, subscribeTrip, type TripCollection, type TripPlace } from "../infra/pocketbase";

// App state: the trip list, the open trip's snapshot, and sync status.
// Each trip's last good snapshot (and the list) is cached so they can be read offline.

export interface AppState {
  readonly trips: readonly TripSummary[] | null;
  readonly tripId: string | null;
  readonly snapshot: TripSnapshot | null;
  readonly meId: string | null;
  readonly syncedAt: number | null;
  readonly online: boolean;
  readonly error: string | null;
}

const TRIPS_KEY = "trips-cache-v1";
const CURRENT_KEY = "trip-current";
const cacheKey = (id: string) => `trip-cache-v2:${id}`;

let state: AppState = { trips: null, tripId: null, snapshot: null, meId: null, syncedAt: null, online: navigator.onLine, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const read = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: offline copy just won't update */ }
};

function persist() {
  if (state.tripId) write(cacheKey(state.tripId), { snapshot: state.snapshot, meId: state.meId, syncedAt: state.syncedAt });
}

export function useApp(): AppState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

export const getState = () => state;

const failedStatus = (e: unknown) => (e as { status?: number }).status;

async function refreshTrips() {
  try {
    const trips = await listTrips();
    set({ trips, online: true });
    write(TRIPS_KEY, trips);
  } catch (e) {
    const status = failedStatus(e);
    if (status === 401 || status === 403) { signOut(); return; }
    set({ online: navigator.onLine && status !== 0 });
  }
}

/** Reload the open trip (or the trip list) from the server. */
export async function refresh() {
  const tripId = state.tripId;
  if (!tripId) { await refreshTrips(); return; }
  try {
    const { snapshot, meId } = await loadSnapshot(tripId);
    if (state.tripId !== tripId) return; // switched away meanwhile
    set({ snapshot, meId, syncedAt: Date.now(), online: true, error: null });
    persist();
  } catch (e) {
    const status = failedStatus(e);
    if (status === 401 || status === 403) { signOut(); return; }
    if (status === 404) { closeTrip(); void refreshTrips(); return; } // deleted on the other phone
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

/** Opens a trip: cached copy first (works offline), then the live data and realtime updates. */
export async function openTrip(tripId: string) {
  stopRealtime?.();
  stopRealtime = null;
  const cached = read<{ snapshot: TripSnapshot; meId: string | null; syncedAt: number | null }>(cacheKey(tripId));
  set({ tripId, snapshot: cached?.snapshot ?? null, meId: cached?.meId ?? null, syncedAt: cached?.syncedAt ?? null, error: null });
  write(CURRENT_KEY, tripId);
  await refresh();
  if (state.tripId !== tripId) return;
  try {
    const stop = await subscribeTrip(tripId, applyEvent, refresh);
    if (state.tripId === tripId) stopRealtime = stop; else stop();
  } catch { /* realtime unavailable: pull on focus still works */ }
}

/** Back to the list. The trip stays remembered, so the next launch opens it again. */
export function closeTrip() {
  stopRealtime?.();
  stopRealtime = null;
  set({ tripId: null, snapshot: null, meId: null, syncedAt: null, error: null });
  void refreshTrips();
}

/**
 * Fetches the signed-in account again: new permissions or name show up without signing in again,
 * and the session is extended each time the app is opened.
 */
async function refreshAccount() {
  if (!pb.authStore.isValid || !navigator.onLine) return;
  try {
    await pb.collection("users").authRefresh();
    set({}); // re-render screens that read the account (tabs, buttons)
  } catch (e) {
    const status = failedStatus(e);
    if (status === 401 || status === 403) signOut();
  }
}

export async function start() {
  set({ trips: read<TripSummary[]>(TRIPS_KEY) });
  if (!pb.authStore.isValid) return;
  void refreshAccount();
  // phones that used the single-trip version keep landing in that trip
  const legacy = read<{ snapshot?: TripSnapshot }>("trip-cache-v1")?.snapshot?.trip.id ?? null;
  const last = read<string>(CURRENT_KEY) ?? legacy;
  if (last) void openTrip(last);
  await refreshTrips();
  // the remembered trip may have been deleted on the other phone
  if (last && state.trips && !state.trips.some((t) => t.id === last) && state.tripId === last) closeTrip();
}

export function signOut() {
  stopRealtime?.();
  stopRealtime = null;
  pb.authStore.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("trip-cache") || k === TRIPS_KEY || k === CURRENT_KEY) localStorage.removeItem(k);
  } catch { /* ignore */ }
  set({ trips: null, tripId: null, snapshot: null, meId: null, syncedAt: null, error: null });
}

window.addEventListener("online", () => { set({ online: true }); void refresh(); });
window.addEventListener("offline", () => set({ online: false }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && pb.authStore.isValid) { void refresh(); void refreshAccount(); }
});

// ---- trips ----

export async function newTrip(title: string, startDate: string, endDate: string, place: TripPlace) {
  if (!navigator.onLine) throw new OfflineError();
  const id = await createTrip(title, startDate, endDate, place);
  await refreshTrips();
  await openTrip(id);
}

export async function setTripDates(startDate: string, endDate: string) {
  guard();
  await changeTripDates(state.tripId!, startDate, endDate);
  await refresh();
  void refreshTrips();
}

export async function removeTrip() {
  guard();
  const id = state.tripId!;
  await deleteTrip(id);
  try { localStorage.removeItem(cacheKey(id)); localStorage.removeItem(CURRENT_KEY); } catch { /* ignore */ }
  closeTrip();
}

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
  void refreshTrips();
}

export { COLLECTIONS };
