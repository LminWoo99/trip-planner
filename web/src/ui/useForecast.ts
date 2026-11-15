import { useEffect, useState } from "react";
import { cachedForecast, fetchForecast, type Forecast } from "../infra/weather";

export function useForecast(): Forecast | null {
  const [forecast, setForecast] = useState<Forecast | null>(() => cachedForecast());
  useEffect(() => {
    let alive = true;
    void fetchForecast().then((f) => { if (alive && f) setForecast(f); });
    return () => { alive = false; };
  }, []);
  return forecast;
}
