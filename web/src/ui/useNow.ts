import { useEffect, useState } from "react";
import type { Day } from "../domain/types";
import { localNow } from "../domain/clock";
import { deviceTz, tzForCity } from "../infra/weather";

/** Current instant, refreshed every 30 seconds and when the app comes back to the front. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);
  return now;
}

export interface TripToday {
  /** the trip day that is today at its destination, if the trip is on */
  readonly day: Day | null;
  /** that destination's zone (the phone's when the trip is not on) */
  readonly tz: string;
  /** wall-clock time there */
  readonly time: string;
}

/** Which trip day it is right now, read in each day's local time rather than the phone's. */
export function tripToday(days: readonly Day[], now: Date): TripToday {
  for (const d of days) {
    const tz = tzForCity(d.city);
    const local = localNow(tz, now);
    if (local.date === d.date) return { day: d, tz, time: local.time };
  }
  const tz = deviceTz();
  return { day: null, tz, time: localNow(tz, now).time };
}
