// Open-Meteo daily forecast for the spots that matter on each day. Free, no key.
// Last result is cached so the forecast still shows (with its time) without signal.

export interface Spot {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly elevation: number;
  /** IANA time zone of the place, for reading "today" and "now" at the destination */
  readonly tz: string;
}

// Fansipan summit 22°18′12″N 103°46′30″E, 3,143m. Sa Pa town centre ~1,500m.
export const SPOTS = {
  sapa: { id: "sapa", name: "사파 시내", lat: 22.3364, lng: 103.8438, elevation: 1500, tz: "Asia/Ho_Chi_Minh" },
  fansipan: { id: "fansipan", name: "판시판 정상", lat: 22.3033, lng: 103.775, elevation: 3143, tz: "Asia/Ho_Chi_Minh" },
  hanoi: { id: "hanoi", name: "하노이", lat: 21.0285, lng: 105.8542, elevation: 15, tz: "Asia/Ho_Chi_Minh" },
} as const satisfies Record<string, Spot>;

const KNOWN: Record<string, Spot[]> = { 사파: [SPOTS.sapa, SPOTS.fansipan], 하노이: [SPOTS.hanoi] };
const lastLeg = (city: string) => city.split("→").pop()?.trim() ?? "";

/** Spots we already know for a day's city text ("사파 → 하노이" → the last leg), without any lookup. */
export function spotsForCity(city: string): Spot[] {
  const last = lastLeg(city);
  const key = Object.keys(KNOWN).find((k) => last.includes(k));
  return key ? KNOWN[key] : [];
}

export interface DailyWeather {
  readonly date: string;
  readonly tMax: number;
  readonly tMin: number;
  readonly rainProb: number;
  readonly cloud: number;
  readonly wind: number; // km/h
  readonly code: number; // WMO weather code
}

export interface Forecast {
  readonly fetchedAt: number;
  readonly bySpot: Readonly<Record<string, readonly DailyWeather[]>>;
}

const GEO_KEY = "weather-geo-v2";
const CACHE_KEY = "weather-cache-v2";
const MAX_AGE_MS = 60 * 60 * 1000;

const readJson = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const writeJson = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };

/**
 * Spots for any city: known ones (Sa Pa, Hanoi) directly, others found once by name
 * through Open-Meteo geocoding (free, no key) and remembered on the phone.
 */
export async function resolveSpots(city: string): Promise<Spot[]> {
  const known = spotsForCity(city);
  if (known.length || !lastLeg(city)) return known;
  const name = lastLeg(city);
  const geo = readJson<Record<string, Spot | null>>(GEO_KEY, {});
  if (name in geo) return geo[name] ? [geo[name]!] : [];
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name, count: "1", language: "ko" })}`, { signal: AbortSignal.timeout(8000) });
    const hit = (await res.json()).results?.[0];
    const spot: Spot | null = hit ? { id: `${hit.latitude},${hit.longitude}`, name: hit.name, lat: hit.latitude, lng: hit.longitude, elevation: Math.round(hit.elevation ?? 0), tz: hit.timezone || deviceTz() } : null;
    writeJson(GEO_KEY, { ...geo, [name]: spot });
    return spot ? [spot] : [];
  } catch {
    return []; // offline: try again next time
  }
}

export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Time zone for a day's city without waiting on the network: known cities, then cities
 * looked up before on this phone, else the phone's own zone.
 */
export function tzForCity(city: string): string {
  const known = spotsForCity(city)[0];
  if (known) return known.tz;
  const hit = readJson<Record<string, Spot | null>>(GEO_KEY, {})[lastLeg(city)];
  return hit?.tz ?? deviceTz();
}

interface Cached { readonly fetchedAt: number; readonly days: readonly DailyWeather[] }

export function cachedForecast(spots: readonly Spot[]): Forecast | null {
  const cache = readJson<Record<string, Cached>>(CACHE_KEY, {});
  const hits = spots.filter((s) => cache[s.id]);
  if (!hits.length) return null;
  return { fetchedAt: Math.min(...hits.map((s) => cache[s.id].fetchedAt)), bySpot: Object.fromEntries(hits.map((s) => [s.id, cache[s.id].days])) };
}

/** Daily forecast for the given spots in one request; fresh results (under an hour) come from the phone. */
export async function fetchForecast(spots: readonly Spot[]): Promise<Forecast | null> {
  if (!spots.length) return null;
  const cache = readJson<Record<string, Cached>>(CACHE_KEY, {});
  const stale = spots.filter((s) => !cache[s.id] || Date.now() - cache[s.id].fetchedAt > MAX_AGE_MS);
  if (stale.length) {
    const q = new URLSearchParams({
      latitude: stale.map((s) => s.lat).join(","),
      longitude: stale.map((s) => s.lng).join(","),
      elevation: stale.map((s) => s.elevation).join(","),
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,weather_code",
      timezone: "auto",
      forecast_days: "16",
    });
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const body = await res.json();
        const list = Array.isArray(body) ? body : [body];
        stale.forEach((s, i) => {
          const d = list[i]?.daily;
          if (!d) return;
          cache[s.id] = {
            fetchedAt: Date.now(),
            days: d.time.map((date: string, k: number) => ({
              date,
              tMax: Math.round(d.temperature_2m_max[k]),
              tMin: Math.round(d.temperature_2m_min[k]),
              rainProb: d.precipitation_probability_max[k] ?? 0,
              cloud: Math.round(d.cloud_cover_mean?.[k] ?? 0),
              wind: Math.round(d.wind_speed_10m_max[k]),
              code: d.weather_code[k],
            })),
          };
        });
        writeJson(CACHE_KEY, cache);
      }
    } catch { /* offline: fall back to what the phone has */ }
  }
  return cachedForecast(spots);
}

export function weatherFor(forecast: Forecast | null, spotId: string, date: string): DailyWeather | null {
  return forecast?.bySpot[spotId]?.find((d) => d.date === date) ?? null;
}

/** WMO code → short Korean label and a lucide icon name. */
export function describe(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "맑음", icon: "sun" };
  if (code <= 2) return { label: "구름 조금", icon: "cloud-sun" };
  if (code === 3) return { label: "흐림", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "안개", icon: "cloud-fog" };
  if (code >= 51 && code <= 57) return { label: "이슬비", icon: "cloud-drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "비", icon: "cloud-rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "눈", icon: "cloud-snow" };
  if (code >= 95) return { label: "뇌우", icon: "cloud-lightning" };
  return { label: "흐림", icon: "cloud" };
}

