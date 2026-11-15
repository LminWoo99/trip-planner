// Straight-line distance and a rough travel-time guess between two stops.

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Leg {
  readonly km: number;
  readonly mode: "walk" | "car";
  readonly minutes: number;
}

// Mountain-town roads wind, so straight-line distance is stretched by 1.3.
const WALK_LIMIT_KM = 1.2;
const WALK_KMH = 4.5;
const CAR_KMH = 25;
const HIGHWAY_KM = 30;
const HIGHWAY_KMH = 50;
const DETOUR = 1.3;

export function estimateLeg(a: LatLng, b: LatLng): Leg {
  const km = distanceKm(a, b) * DETOUR;
  const mode = km <= WALK_LIMIT_KM ? "walk" : "car";
  const kmh = mode === "walk" ? WALK_KMH : km > HIGHWAY_KM ? HIGHWAY_KMH : CAR_KMH;
  const minutes = Math.max(1, Math.round((km / kmh) * 60));
  return { km, mode, minutes };
}

/** Two stops closer than this are the same place; no distance row between them. */
export const isSameSpot = (a: LatLng, b: LatLng) => distanceKm(a, b) < 0.03;

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

export interface MapTarget {
  readonly place: string;
  readonly placeId: string;
}

/** Opens the exact place when a Google place id is known, otherwise searches by name. */
export function gmapsSearch(t: MapTarget): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.place)}`;
  return t.placeId ? `${base}&query_place_id=${encodeURIComponent(t.placeId)}` : base;
}

export function gmapsRoute(stops: readonly MapTarget[]): string | null {
  if (stops.length < 2) return null;
  const enc = encodeURIComponent;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const mid = stops.slice(1, -1);
  let url = `https://www.google.com/maps/dir/?api=1&origin=${enc(first.place)}&destination=${enc(last.place)}`;
  if (first.placeId) url += `&origin_place_id=${enc(first.placeId)}`;
  if (last.placeId) url += `&destination_place_id=${enc(last.placeId)}`;
  if (mid.length) {
    url += `&waypoints=${enc(mid.map((s) => s.place).join("|"))}`;
    if (mid.every((s) => s.placeId)) url += `&waypoint_place_ids=${enc(mid.map((s) => s.placeId).join("|"))}`;
  }
  return url;
}
