#!/usr/bin/env node
// One-time import of seed.json into PocketBase (first deploy only).
//
//   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... \
//     node scripts/seed-import.mjs /path/to/seed.json [--geocode]
//
// Creates the two member accounts, the trip and all trip data. Refuses to run twice.
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import PocketBase from "pocketbase";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const geocode = args.includes("--geocode");
const { PB_URL = "http://127.0.0.1:8090", PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;

if (!file || !PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error("usage: PB_ADMIN_EMAIL=.. PB_ADMIN_PASSWORD=.. node scripts/seed-import.mjs <seed.json> [--geocode]");
  process.exit(1);
}

const seed = JSON.parse(await readFile(file, "utf8"));
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
await pb.collection("_superusers").authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

const existing = await pb.collection("trips").getList(1, 1, { filter: pb.filter("title = {:t}", { t: seed.meta.title }) });
if (existing.totalItems > 0) {
  console.error(`trip "${seed.meta.title}" already exists — aborting so nothing is duplicated`);
  process.exit(1);
}

// Nominatim usage policy: max 1 request/second with an identifying User-Agent.
// Search inside the day's area first so "Phở Hà Nội Sapa" doesn't land in Hanoi.
const AREAS = { 사파: "103.70,22.45,103.95,22.22", 하노이: "105.60,21.30,106.00,20.90" };
const areasFor = (city = "") => {
  const names = city.split("→").map((x) => x.trim()).reverse();
  return [...new Set(names.flatMap((n) => Object.keys(AREAS).filter((a) => n.includes(a))))];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const geoCache = new Map();
async function search(q, viewbox) {
  await sleep(1100);
  const params = new URLSearchParams({ format: "json", limit: "1", countrycodes: "vn", q });
  if (viewbox) { params.set("viewbox", viewbox); params.set("bounded", "1"); }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": "trip-planner-seed/1.0 (personal use)" } });
  const [first] = await res.json();
  return first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
}
async function locate(q, city) {
  if (!geocode || !q) return {};
  const key = `${q}|${city}`;
  if (geoCache.has(key)) return geoCache.get(key);
  let hit = null;
  try {
    const areas = areasFor(city);
    for (const area of areas) { hit = await search(q, AREAS[area]); if (hit) break; }
    if (!hit && areas.length === 0) hit = await search(q);
  } catch (e) {
    console.warn(`geocode failed for "${q}": ${e.message}`);
  }
  console.log(`  geocode ${hit ? "ok  " : "miss"} ${q}`);
  geoCache.set(key, hit ?? {});
  return hit ?? {};
}

const { meta } = seed;
const toDate = (d) => `${d} 00:00:00.000Z`;

// ---- members ----
const people = [
  { name: meta.nameA, email: "minu@trip.local", role: "owner" },
  { name: meta.nameB, email: "ryeojin@trip.local", role: "member" },
];
const users = [];
for (const p of people) {
  const password = randomBytes(24).toString("base64url"); // never used: password login is disabled
  users.push(await pb.collection("users").create({ name: p.name, email: p.email, password, passwordConfirm: password, verified: true }));
}

const trip = await pb.collection("trips").create({
  title: meta.title, start: toDate(meta.start), end: toDate(meta.end),
  vndKrw: meta.vndKrw, usdKrw: meta.usdKrw, budget: meta.budget || 0,
});
const T = trip.id;

const memberIds = [];
for (const [i, p] of people.entries()) {
  memberIds.push((await pb.collection("trip_members").create({ trip: T, user: users[i].id, displayName: p.name, role: p.role })).id);
}

// ---- days / groups / items ----
const dayId = {};
const dayCity = Object.fromEntries(seed.days.map((d) => [d.id, d.city || ""]));
for (const d of seed.days) {
  const rec = await pb.collection("days").create({
    trip: T, n: d.n, date: toDate(d.date), city: d.city || "", title: d.title || "", stay: d.stay || "", memo: d.memo || "",
  });
  dayId[d.id] = rec.id;
}

const groupId = {};
for (const g of seed.groups || []) {
  const rec = await pb.collection("groups").create({
    trip: T, day: dayId[g.day], order: g.order, title: g.title, decideAt: g.decideAt || "",
    branches: g.branches, selected: g.selected || "",
  });
  groupId[g.id] = rec.id;
}

// NOL times like "7:45" are normalized to HH:MM; anything else is dropped.
const normTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

console.log(`items: ${seed.items.length}`);
for (const it of seed.items) {
  await pb.collection("items").create({
    trip: T, day: dayId[it.day], order: it.order, time: normTime(it.time), cat: it.cat, title: it.title,
    place: it.place || "", memo: it.memo || "", link: it.link || "",
    cost: it.cost || 0, cur: it.cur || "",
    group: it.group ? groupId[it.group] : "", branch: it.branch || "",
    ...(await locate(it.place, dayCity[it.day])),
  });
}

for (const p of seed.places || []) {
  await pb.collection("places").create({
    trip: T, name: p.name, city: p.city || "", type: p.type || "", q: p.q || p.name,
    price: p.price || "", memo: p.memo || "", link: p.link || "", visited: !!p.visited,
    ...(await locate(p.q || p.name, p.city)),
  });
}

for (const b of seed.bookings || []) {
  await pb.collection("bookings").create({
    trip: T, type: b.type, title: b.title, when: b.when || "", code: b.code || "", memo: b.memo || "", link: b.link || "",
  });
}

for (const [i, c] of (seed.checklist || []).entries()) {
  await pb.collection("checklist").create({
    trip: T, text: c.text, cat: c.cat || "기타", who: c.who || "같이", memo: c.memo || "", done: !!c.done, order: i + 1,
  });
}

await pb.collection("notes").create({ trip: T, text: "" });

console.log(`done: trip ${T}, members ${memberIds.join(", ")}`);
