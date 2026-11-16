import { useEffect, useState } from "react";
import { cachedForecast, fetchForecast, resolveSpots, spotsForCity, type Forecast, type Spot } from "../infra/weather";

/** Weather spots for a day's city and their forecast: the phone's copy first, then a fresh one. */
export function useForecast(city: string): { spots: Spot[]; forecast: Forecast | null } {
  const [spots, setSpots] = useState<Spot[]>(() => spotsForCity(city));
  const [forecast, setForecast] = useState<Forecast | null>(() => cachedForecast(spotsForCity(city)));
  useEffect(() => {
    let alive = true;
    void resolveSpots(city).then(async (found) => {
      if (!alive) return;
      setSpots(found);
      setForecast(cachedForecast(found));
      const fresh = await fetchForecast(found);
      if (alive) setForecast(fresh);
    });
    return () => { alive = false; };
  }, [city]);
  return { spots, forecast };
}
