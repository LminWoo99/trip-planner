import PocketBase, { type RecordModel } from "pocketbase";
import { citiesOf, type TripSummary } from "../domain/trips";
import type {
  Booking, BranchKey, ChecklistItem, Currency, Day, Expense, Group, Item, Member, Note, Place, Trip, TripSnapshot,
} from "../domain/types";

// Same origin in production (PocketBase serves the app); Vite proxies /api in dev.
export const pb = new PocketBase(location.origin);
pb.autoCancellation(false);

export const COLLECTIONS = ["days", "groups", "items", "places", "expenses", "checklist", "bookings", "notes"] as const;
export type TripCollection = (typeof COLLECTIONS)[number];

// ---- record → domain ----
const date = (v: string) => (v ? v.slice(0, 10) : "");
const orNull = <T,>(v: unknown) => ((v === "" || v === undefined || v === null ? null : v) as T | null);
const num = (v: unknown) => (typeof v === "number" && v !== 0 ? v : null);

export const toTrip = (r: RecordModel): Trip => ({
  id: r.id, title: r.title, start: date(r.start), end: date(r.end),
  vndKrw: r.vndKrw || 0.053, usdKrw: r.usdKrw || 1395, budget: r.budget || 0,
});
export const toMember = (r: RecordModel): Member => ({ id: r.id, user: r.user, displayName: r.displayName });

export const mappers: { [K in TripCollection]: (r: RecordModel) => TripSnapshot[K][number] } = {
  days: (r): Day => ({ id: r.id, n: r.n, date: date(r.date), city: r.city, title: r.title, stay: r.stay, memo: r.memo }),
  groups: (r): Group => ({
    id: r.id, day: r.day, order: r.order, title: r.title, decideAt: r.decideAt, branches: r.branches ?? [],
    selected: orNull<BranchKey>(r.selected), selectedBy: orNull<string>(r.selectedBy), selectedAt: orNull<string>(r.selectedAt),
  }),
  items: (r): Item => ({
    id: r.id, day: r.day, order: r.order, time: r.time, cat: r.cat, title: r.title, place: r.place, placeId: r.placeId ?? "",
    lat: num(r.lat), lng: num(r.lng), memo: r.memo, cost: r.cost || 0, cur: orNull<Currency>(r.cur), link: r.link,
    done: !!r.done, group: orNull<string>(r.group), branch: orNull<BranchKey>(r.branch),
    stops: Array.isArray(r.stops) ? r.stops : [],
    photos: Array.isArray(r.photos) ? r.photos : [],
  }),
  places: (r): Place => ({
    id: r.id, name: r.name, city: r.city, type: r.type, q: r.q, placeId: r.placeId ?? "", lat: num(r.lat), lng: num(r.lng),
    price: r.price, memo: r.memo, link: r.link, visited: !!r.visited,
  }),
  expenses: (r): Expense => ({
    id: r.id, kind: r.kind === "deposit" ? "deposit" : "spend", title: r.title, amount: r.amount, cur: r.cur,
    payer: orNull<string>(r.payer), fromPool: !!r.fromPool, split: r.split || "half", cat: r.cat,
    day: orNull<string>(r.day), memo: r.memo, created: r.created,
  }),
  checklist: (r): ChecklistItem => ({ id: r.id, text: r.text, cat: r.cat, who: r.who, memo: r.memo, done: !!r.done, order: r.order || 0 }),
  bookings: (r): Booking => ({ id: r.id, type: r.type, title: r.title, when: r.when, code: r.code, memo: r.memo, link: r.link }),
  notes: (r): Note => ({ id: r.id, text: r.text }),
};

/** Loads one trip with one request per collection (no per-day queries). */
export async function loadSnapshot(tripId: string): Promise<{ snapshot: TripSnapshot; meId: string | null }> {
  const tripRec = await pb.collection("trips").getOne(tripId);
  const filter = pb.filter("trip = {:t}", { t: tripRec.id });

  const [memberRecs, ...lists] = await Promise.all([
    pb.collection("trip_members").getFullList({ filter }),
    ...COLLECTIONS.map((c) => pb.collection(c).getFullList({ filter })),
  ]);
  const members = memberRecs.map(toMember);
  const snapshot = {
    trip: toTrip(tripRec),
    members,
    ...Object.fromEntries(COLLECTIONS.map((c, i) => [c, lists[i].map(mappers[c] as (r: RecordModel) => unknown)])),
  } as unknown as TripSnapshot;
  const meId = members.find((m) => m.user === pb.authStore.record?.id)?.id ?? null;
  return { snapshot, meId };
}

export type RealtimeHandler = (collection: TripCollection, action: string, record: RecordModel) => void;

export async function subscribeTrip(tripId: string, onEvent: RealtimeHandler, onReconnect: () => void): Promise<() => void> {
  const filter = pb.filter("trip = {:t}", { t: tripId });
  const unsubs = await Promise.all(
    COLLECTIONS.map((c) => pb.collection(c).subscribe("*", (e) => onEvent(c, e.action, e.record), { filter })),
  );
  let first = true;
  const unsubConnect = await pb.realtime.subscribe("PB_CONNECT", () => {
    if (first) { first = false; return; }
    onReconnect(); // missed events while disconnected: reload everything
  });
  return () => { unsubs.forEach((u) => u()); unsubConnect(); };
}

export async function enterWithCode(code: string, who: string): Promise<void> {
  const res = await pb.send("/api/gate/enter", { method: "POST", body: { code, who } });
  pb.authStore.save(res.token, res.record);
}

export async function checkCode(code: string): Promise<void> {
  await pb.send("/api/gate/check", { method: "POST", body: { code } });
}

// ---- trip list ----

/** Every trip the signed-in person belongs to, plus each trip's cities: two requests in total. */
export async function listTrips(): Promise<TripSummary[]> {
  const [trips, days] = await Promise.all([
    pb.collection("trips").getFullList({ sort: "-start" }),
    pb.collection("days").getFullList({ fields: "trip,date,city,title", sort: "n" }),
  ]);
  return trips.map((t) => {
    const own = days.filter((d) => d.trip === t.id);
    return {
      id: t.id, title: t.title, start: date(t.start), end: date(t.end),
      cities: citiesOf(own.map((d) => d.city).filter(Boolean)),
      dayTitles: Object.fromEntries(own.map((d) => [date(d.date), d.title])),
    };
  });
}

export async function createTrip(title: string, start: string, end: string): Promise<string> {
  const res = await pb.send("/api/trips", { method: "POST", body: { title, start, end } });
  return res.id;
}

export async function changeTripDates(tripId: string, start: string, end: string): Promise<void> {
  await pb.send(`/api/trips/${tripId}/dates`, { method: "POST", body: { start, end } });
}

export async function deleteTrip(tripId: string): Promise<void> {
  await pb.send(`/api/trips/${tripId}`, { method: "DELETE" });
}
