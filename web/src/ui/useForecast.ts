import { useEffect, useState } from "react";
import { cachedForecast, fetchForecast, resolveSpots, spotsForCity, type Forecast, type Spot } from "../infra/weather";

/** Weather spots for a day's city and their forecast: the phone's copy first, then a fresh one. */
export function useForecast(city: string): { spots: Spot[]; forecast: Forecast | null } {
  const [spots, setSpots] = useState<Spot[]>(() => spotsForCity(city));
  const [forecast, setForecast] = useState<Forecast | null>(() => cachedForecast(spotsForCity(city)));
  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async (again: boolean) => {
      const found = await resolveSpots(city);
      if (!alive) return;
      setSpots(found);
      setForecast(cachedForecast(found));
      const fresh = await fetchForecast(found);
      if (!alive) return;
      setForecast(fresh);
      // a slow or dropped connection: try once more shortly
      if ((!found.length || !fresh) && again && city && navigator.onLine) retry = setTimeout(() => void load(false), 3000);
    };
    void load(true);
    return () => { alive = false; clearTimeout(retry); };
  }, [city]);
  return { spots, forecast };
}
