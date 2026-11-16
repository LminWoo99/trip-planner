import { importLibrary } from "@googlemaps/js-api-loader";
import { loadMaps } from "./google";

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

export function computeLeg(from: LatLng, to: LatLng, mode: Mode, departure?: Date): Promise<RouteResult | null> {
  const when = departure ? Math.floor(departure.getTime() / 900_000) : "now"; // 15-minute buckets
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}|${mode}|${when}`;
  if (!cache.has(key)) {
    const p = fetchLeg(from, to, mode, departure).catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key)!;
}

const mins = (ms: number | null | undefined) => Math.max(1, Math.round((ms ?? 0) / 60_000));
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").trim();

async function fetchLeg(from: LatLng, to: LatLng, mode: Mode, departure?: Date): Promise<RouteResult | null> {
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
        const at = (d: Date | null) => (d ? d.toTimeString().slice(0, 5) : "");
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
