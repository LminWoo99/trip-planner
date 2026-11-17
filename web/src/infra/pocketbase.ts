import PocketBase, { type RecordModel } from "pocketbase";
import { citiesOf, type TripSummary } from "../domain/trips";
import { normalizeLook, type Features, type Garment, type Look } from "../domain/wardrobe";
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
export const toMember = (r: RecordModel): Member => ({ id: r.id, user: r.user, displayName: r.displayName, role: r.role === "owner" ? "owner" : "member" });

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
    booking: orNull<string>(r.booking),
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
  bookings: (r): Booking => ({ id: r.id, type: r.type, title: r.title, when: r.when, code: r.code, memo: r.memo, link: r.link, files: Array.isArray(r.files) ? r.files : [] }),
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

export async function login(username: string, password: string): Promise<void> {
  await pb.collection("users").authWithPassword(username.trim().toLowerCase(), password);
}

export async function signup(username: string, name: string, password: string): Promise<void> {
  const res = await pb.send("/api/signup", { method: "POST", body: { username, name, password } });
  pb.authStore.save(res.token, res.record);
}

export type Perm = "outfits" | "ai";

/** Who is signed in, from the auth record (refreshed on every app open). */
export function me(): { id: string; name: string; username: string; admin: boolean; perms: Perm[] } | null {
  const r = pb.authStore.record;
  if (!r) return null;
  return { id: r.id, name: r.name ?? "", username: r.username ?? "", admin: r.role === "admin", perms: Array.isArray(r.perms) ? r.perms : [] };
}

// ---- invites ----

export interface InvitePreview { tripId: string; title: string; start: string; end: string; cities: string[]; members: string[]; inviter: string; status: "none" | "pending" | "approved" | "rejected" | "member" }
export interface JoinRequest { id: string; name: string; username: string; created: string }

export const createInvite = (tripId: string): Promise<{ token: string; expires: string }> => pb.send(`/api/trips/${tripId}/invite`, { method: "POST" });
export const invitePreview = (token: string): Promise<InvitePreview> => pb.send(`/api/invites/${encodeURIComponent(token)}`, { method: "GET" });
export const requestJoin = (token: string): Promise<{ status: string }> => pb.send(`/api/invites/${encodeURIComponent(token)}/request`, { method: "POST" });
export const tripRequests = (tripId: string): Promise<JoinRequest[]> => pb.send(`/api/trips/${tripId}/requests`, { method: "GET" });
export const decideRequest = (id: string, approve: boolean) => pb.send(`/api/requests/${id}/decide`, { method: "POST", body: { approve } });
export const myInvites = (): Promise<{ pending: { tripId: string; title: string }[]; waiting: Record<string, number> }> => pb.send("/api/me/invites", { method: "GET" });
export const inviteUrl = (token: string) => `${location.origin}/j/${token}`;

// ---- outfits ----

/** face: file name of the AI face (empty until made); base: plain-clothes drawing on their trip membership `member` */
export interface OutfitPerson { user: string; member: string; name: string; avatar: Look | null; face: string; base: string }
/** render: AI full-body drawing file; renderFor: the clothes it was drawn with (see renderKey) */
export interface OutfitRec { id: string; day: string; user: string; items: Garment[]; likedBy: string[]; render: string; renderFor: string }

const toOutfit = (r: RecordModel): OutfitRec => ({
  id: r.id, day: r.day, user: r.user, items: Array.isArray(r.items) ? r.items : [], likedBy: Array.isArray(r.likedBy) ? r.likedBy : [],
  render: r.render ?? "", renderFor: r.renderFor ?? "",
});

export const outfitPeople = async (tripId: string): Promise<OutfitPerson[]> =>
  ((await pb.send(`/api/outfits/people?trip=${encodeURIComponent(tripId)}`, { method: "GET" })) as OutfitPerson[]).map((p) => ({ ...p, avatar: normalizeLook(p.avatar), face: p.face ?? "", base: p.base ?? "" }));
export const saveLook = (look: Look, user?: string) => pb.send("/api/avatar", { method: "POST", body: { look, user } });
export const listOutfits = async (tripId: string): Promise<OutfitRec[]> =>
  (await pb.collection("outfits").getFullList({ filter: pb.filter("trip = {:t}", { t: tripId }) })).map(toOutfit);
export async function saveOutfit(tripId: string, day: string, existing: OutfitRec | null, data: { items?: Garment[]; likedBy?: string[] }): Promise<OutfitRec> {
  const r = existing
    ? await pb.collection("outfits").update(existing.id, data)
    : await pb.collection("outfits").create({ trip: tripId, day, user: pb.authStore.record?.id, items: [], likedBy: [], ...data });
  return toOutfit(r);
}
export async function subscribeOutfits(tripId: string, onChange: () => void): Promise<() => void> {
  return pb.collection("outfits").subscribe("*", onChange, { filter: pb.filter("trip = {:t}", { t: tripId }) });
}

// ---- AI ----

export interface PlanItem { time: string; title: string; cat: string; place: string; memo: string; placeId?: string; lat?: number; lng?: number }
export interface AiPerson { position: number; body: "m" | "f"; build: Look["build"]; hairStyle: string; glasses: Look["glasses"] | "none"; hairColor: string; skin: string; summary: string }
export interface AiGarment extends Features { text: string; slot: string; label: string; color: string }

export const aiAvatar = (image: string, hairStyles: string[]): Promise<{ people: AiPerson[] }> => pb.send("/api/ai/avatar", { method: "POST", body: { image, hairStyles } });
/** A 3D emoji-style face of one person in the photo (count: people in it, position: 1 = left). Not stored until saveFace. */
export const aiFace = (image: string, count: number, position: number, summary: string, note = ""): Promise<{ image: string }> =>
  pb.send("/api/ai/face", { method: "POST", body: { image, count, position, summary, note } });
export const saveFace = (image: string, user?: string): Promise<{ face: string }> => pb.send("/api/avatar/face", { method: "POST", body: { image, user } });
export const aiBase = (trip: string, user: string): Promise<{ base: string }> => pb.send("/api/ai/base", { method: "POST", body: { trip, user } });
export const aiRender = (outfit: string): Promise<{ render: string; renderFor: string }> => pb.send("/api/ai/render", { method: "POST", body: { outfit } });
export const aiClothes = (lines: string[], colors: string[]): Promise<{ items: AiGarment[] }> =>
  pb.send("/api/ai/clothes", { method: "POST", body: { lines, colors } });
export const aiPlan = (tripId: string, text: string): Promise<{ days: { n: number; items: PlanItem[] }[] }> => pb.send("/api/ai/plan", { method: "POST", body: { tripId, text } });
export const applyPlan = (tripId: string, mode: "append" | "replace", days: { day: string; items: PlanItem[] }[]): Promise<{ added: number }> =>
  pb.send(`/api/trips/${tripId}/apply-plan`, { method: "POST", body: { mode, days } });

// ---- restore points ----

export interface Snapshot { id: string; by: string; label: string; created: string; days: { day: string; items: number; groups: number }[] }
export async function listSnapshots(tripId: string): Promise<Snapshot[]> {
  const list = await pb.collection("trip_snapshots").getList(1, 30, { filter: pb.filter("trip = {:t}", { t: tripId }), sort: "-created" });
  return list.items.map((r) => ({
    id: r.id, by: r.by, label: r.label, created: r.created,
    days: ((r.data?.days ?? []) as { day: string; items: unknown[]; groups: unknown[] }[]).map((d) => ({ day: d.day, items: d.items.length, groups: d.groups.length })),
  }));
}
export const restoreSnapshot = (id: string) => pb.send(`/api/snapshots/${id}/restore`, { method: "POST" });
export async function subscribeSnapshots(tripId: string, onNew: (s: { by: string; label: string }) => void): Promise<() => void> {
  return pb.collection("trip_snapshots").subscribe("*", (e) => { if (e.action === "create") onNew({ by: e.record.by, label: e.record.label }); }, { filter: pb.filter("trip = {:t}", { t: tripId }) });
}

// ---- admin ----

export interface AdminUser { id: string; username: string; name: string; role: string; perms: Perm[]; created: string; lastSeen: string; trips: number }
export interface AuthEvent { id: string; kind: "login_ok" | "login_fail" | "signup"; user: string; name: string; username: string; ip: string; country: string; ua: string; created: string }

export const adminOverview = (): Promise<{ users: AdminUser[]; events: AuthEvent[]; aiUsage?: Record<"plan" | "clothes" | "avatar" | "face" | "render", number> }> => pb.send("/api/admin/overview", { method: "GET" });
export const setPerms = (id: string, perms: Perm[]) => pb.send(`/api/admin/users/${id}/perms`, { method: "POST", body: { perms } });

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
