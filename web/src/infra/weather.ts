// Open-Meteo daily forecast for the spots that matter on each day. Free, no key.
// Last result is cached so the forecast still shows (with its time) without signal.

export interface Spot {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly elevation: number;
}

// Fansipan summit 22°18′12″N 103°46′30″E, 3,143m. Sa Pa town centre ~1,500m.
export const SPOTS = {
  sapa: { id: "sapa", name: "사파 시내", lat: 22.3364, lng: 103.8438, elevation: 1500 },
  fansipan: { id: "fansipan", name: "판시판 정상", lat: 22.3033, lng: 103.775, elevation: 3143 },
  hanoi: { id: "hanoi", name: "하노이", lat: 21.0285, lng: 105.8542, elevation: 15 },
} as const satisfies Record<string, Spot>;

/** Where to look for a day's weather, from its city text ("사파 → 하노이" → the last leg). */
export function spotsForCity(city: string): Spot[] {
  const last = city.split("→").pop()?.trim() ?? "";
  if (last.includes("사파")) return [SPOTS.sapa, SPOTS.fansipan];
  if (last.includes("하노이")) return [SPOTS.hanoi];
  return [];
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

const CACHE_KEY = "weather-cache-v1";
const MAX_AGE_MS = 60 * 60 * 1000;

function readCache(): Forecast | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Forecast) : null;
  } catch { return null; }
}

export function cachedForecast(): Forecast | null {
  return readCache();
}

export async function fetchForecast(): Promise<Forecast | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached;
  const spots = Object.values(SPOTS);
  const q = new URLSearchParams({
    latitude: spots.map((s) => s.lat).join(","),
    longitude: spots.map((s) => s.lng).join(","),
    elevation: spots.map((s) => s.elevation).join(","),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,weather_code",
    timezone: "Asia/Bangkok",
    forecast_days: "16",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!res.ok) return cached;
    const body = await res.json();
    const list = Array.isArray(body) ? body : [body];
    const bySpot: Record<string, DailyWeather[]> = {};
    spots.forEach((s, i) => {
      const d = list[i]?.daily;
      if (!d) return;
      bySpot[s.id] = d.time.map((date: string, k: number) => ({
        date,
        tMax: Math.round(d.temperature_2m_max[k]),
        tMin: Math.round(d.temperature_2m_min[k]),
        rainProb: d.precipitation_probability_max[k] ?? 0,
        cloud: Math.round(d.cloud_cover_mean?.[k] ?? 0),
        wind: Math.round(d.wind_speed_10m_max[k]),
        code: d.weather_code[k],
      }));
    });
    const forecast = { fetchedAt: Date.now(), bySpot };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(forecast)); } catch { /* ignore */ }
    return forecast;
  } catch {
    return cached;
  }
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

export const MOUNTAIN_FORECAST_URL = "https://www.mountain-forecast.com/peaks/Fan-Si-Pan/forecasts/3211";
