import { importLibrary } from "@googlemaps/js-api-loader";
import { loadMaps } from "./google";
import { formatHm } from "../domain/clock";
import { deviceTz } from "./weather";

// Real travel between two stops from Google Routes (driving, motorbike, walking, transit).
// Called only when a leg sheet is opened; results are kept per leg and mode for the session.

export type Mode = "DRIVING" | "TWO_WHEELER" | "WALKING" | "TRANSIT";

export interface TransitLine {
  readonly name: string;
  readonly short: string;
  readonly color: string;
  readonly textColor: string;
  readonly vehicle: string;
}

export interface Step {
  readonly kind: "walk" | "move" | "transit";
  readonly text: string;
  readonly sub: string;
  readonly minutes: number;
  readonly meters: number;
  readonly line?: TransitLine;
}

export interface RouteResult {
  readonly minutes: number;
  readonly meters: number;
  readonly path: readonly google.maps.LatLngLiteral[];
  readonly steps: readonly Step[];
  readonly fare: string | null;
  readonly transfers: number;
  readonly departAt: Date | null;
  readonly arriveAt: Date | null;
  /** a transit request answered with walking only (the stops are too close for a bus or train) */
  readonly walkOnly: boolean;
}

type LatLng = google.maps.LatLngLiteral;
const cache = new Map<string, Promise<RouteResult | null>>();

export function computeLeg(from: LatLng, to: LatLng, mode: Mode, departure?: Date, tz = deviceTz()): Promise<RouteResult | null> {
  const when = departure ? Math.floor(departure.getTime() / 900_000) : "now"; // 15-minute buckets
  // departure time and zone only change transit answers; other modes share one entry
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}|${mode}${mode === "TRANSIT" ? `|${when}|${tz}` : ""}`;
  if (!cache.has(key)) {
    const p = fetchLeg(from, to, mode, departure, tz).catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key)!;
}

const mins = (ms: number | null | undefined) => Math.max(1, Math.round((ms ?? 0) / 60_000));
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").trim();

async function fetchLeg(from: LatLng, to: LatLng, mode: Mode, departure: Date | undefined, tz: string): Promise<RouteResult | null> {
  await loadMaps(); // configures the loader with the key
  const { Route } = await importLibrary("routes");
  // Google only accepts future departure times; past or missing → leave now
  const departureTime = departure && departure.getTime() > Date.now() ? departure : undefined;
  const { routes } = await Route.computeRoutes({
    origin: from,
    destination: to,
    travelMode: mode,
    language: "ko",
    fields: ["durationMillis", "distanceMeters", "path", "legs", "travelAdvisory"],
    ...(mode === "TRANSIT" ? { departureTime } : {}),
  });
  const r = routes?.[0];
  if (!r) return null;

  const steps: Step[] = [];
  let transfers = -1;
  let departAt: Date | null = null;
  let arriveAt: Date | null = null;
  for (const leg of r.legs ?? []) {
    for (const s of leg.steps) {
      const t = s.transitDetails;
      if (t) {
        transfers++;
        departAt ??= t.departureTime;
        arriveAt = t.arrivalTime;
        const line = t.transitLine;
        const at = (d: Date | null) => (d ? formatHm(d, tz) : "");
        steps.push({
          kind: "transit",
          text: `${line?.name || line?.shortName || "대중교통"}${t.headsign ? ` · ${t.headsign} 방면` : ""}`,
          sub: `${t.departureStop?.name ?? ""} ${at(t.departureTime)} → ${t.arrivalStop?.name ?? ""} ${at(t.arrivalTime)} · ${t.stopCount}정거장`,
          minutes: mins(s.staticDurationMillis),
          meters: s.distanceMeters,
          line: {
            name: line?.name ?? "",
            short: line?.shortName || (line?.name ?? "").slice(0, 2),
            color: line?.color || "#565d66",
            textColor: line?.textColor || "#ffffff",
            vehicle: line?.vehicle?.name ?? "",
          },
        });
      } else {
        const kind = s.travelMode === "WALKING" ? "walk" : "move";
        const text = stripHtml(s.instructions ?? "") || (kind === "walk" ? "걷기" : "이동");
        const prev = steps[steps.length - 1];
        // transit routes list many tiny walking turns; fold consecutive walking into one row
        if (mode === "TRANSIT" && kind === "walk" && prev?.kind === "walk") {
          const meters = prev.meters + s.distanceMeters;
          steps[steps.length - 1] = { ...prev, minutes: prev.minutes + mins(s.staticDurationMillis), meters, sub: formatMeters(meters) };
          continue;
        }
        steps.push({ kind, text: mode === "TRANSIT" && kind === "walk" ? "걷기" : text, sub: formatMeters(s.distanceMeters), minutes: mins(s.staticDurationMillis), meters: s.distanceMeters });
      }
    }
  }
  const fare = r.travelAdvisory?.transitFare;
  return {
    minutes: mins(r.durationMillis),
    meters: r.distanceMeters ?? 0,
    path: (r.path ?? []).map((p) => ({ lat: p.lat, lng: p.lng })),
    steps,
    fare: fare && fare.units > 0 ? `${fare.units.toLocaleString("ko-KR")} ${fare.currencyCode}` : null,
    transfers: Math.max(0, transfers),
    departAt,
    arriveAt,
    walkOnly: mode === "TRANSIT" && !steps.some((s) => s.kind === "transit"),
  };
}

export const formatMeters = (m: number) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

/**
 * Grab app link with the drop-off filled in. Grab publishes no official URL format for this,
 * so the sheet also copies the destination name; if the app ignores the coordinates it can be pasted.
 */
export function grabUrl(to: LatLng, name: string): string {
  const q = new URLSearchParams({ screenType: "BOOKING", dropOffLatitude: String(to.lat), dropOffLongitude: String(to.lng), dropOffAddress: name });
  return `grab://open?${q}`;
}

// ---- timeline times: small results kept on the phone so each leg is asked once a week ----

export interface LegTimes {
  readonly walk: { minutes: number; meters: number } | null;
  readonly transit: { minutes: number; meters: number } | null;
  readonly car: { minutes: number; meters: number } | null;
}

const TIMES_KEY = "leg-times-v1";
const TIMES_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const pending = new Map<string, Promise<LegTimes>>();

const readTimes = (): Record<string, { at: number; v: LegTimes }> => {
  try { return JSON.parse(localStorage.getItem(TIMES_KEY) ?? "{}"); } catch { return {}; }
};

export function cachedLegTimes(from: LatLng, to: LatLng): LegTimes | null {
  const hit = readTimes()[timesKey(from, to)];
  return hit && Date.now() - hit.at < TIMES_TTL_MS ? hit.v : null;
}

const timesKey = (a: LatLng, b: LatLng) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;

/** Real walk / transit / car times for a leg; short legs only ask for walking. */
export function legTimes(from: LatLng, to: LatLng, straightKm: number): Promise<LegTimes> {
  const key = timesKey(from, to);
  const cached = cachedLegTimes(from, to);
  if (cached) return Promise.resolve(cached);
  if (!pending.has(key)) {
    const pick = (r: RouteResult | null) => (r ? { minutes: r.minutes, meters: r.meters } : null);
    const p = (async () => {
      const walkOnly = straightKm <= 1.5;
      const [walk, transit, car] = await Promise.all([
        walkOnly || straightKm <= 3 ? computeLeg(from, to, "WALKING").then(pick) : Promise.resolve(null),
        walkOnly ? Promise.resolve(null) : computeLeg(from, to, "TRANSIT").then((r) => (r && !r.walkOnly ? pick(r) : null)),
        walkOnly ? Promise.resolve(null) : computeLeg(from, to, "DRIVING").then(pick),
      ]);
      const v: LegTimes = { walk, transit, car };
      rememberLegTimes(from, to, v);
      return v;
    })().finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return pending.get(key)!;
}

/**
 * Stores a leg's times and tells the timeline. The leg sheet calls this with what it showed,
 * so the timeline number becomes exactly the sheet's number afterwards.
 */
export function rememberLegTimes(from: LatLng, to: LatLng, v: LegTimes): void {
  try {
    const all = readTimes();
    all[timesKey(from, to)] = { at: Date.now(), v };
    localStorage.setItem(TIMES_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(LEG_TIMES_EVENT));
}

export const LEG_TIMES_EVENT = "leg-times";
