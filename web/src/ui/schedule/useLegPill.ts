import { useEffect, useState } from "react";
import { Car, Footprints, TrainFront } from "lucide-react";
import { distanceKm, estimateLeg, pickLegMode, type LatLng, type PillMode } from "../../domain/geo";
import { cachedLegTimes, LEG_TIMES_EVENT, legTimes, type LegTimes, type Mode } from "../../infra/routes";
import { hasGoogleKey } from "../../infra/google";

export const PILL = { walk: { icon: Footprints, label: "도보" }, car: { icon: Car, label: "차" }, transit: { icon: TrainFront, label: "대중교통" } } as const;

/** Real Google times once known (kept on the phone), the straight-line estimate until then or offline. */
export function useLegPill(from: LatLng, to: LatLng): { mode: PillMode; minutes: number; km: number; real: boolean } {
  const leg = estimateLeg(from, to);
  const straight = distanceKm(from, to);
  const toPill = (t: LegTimes | null) => {
    const p = t && pickLegMode(t);
    return p ? { mode: p.mode, minutes: p.time.minutes, km: p.time.meters / 1000, real: true } : null;
  };
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}`;
  const [fetched, setFetched] = useState<{ key: string; pill: ReturnType<typeof toPill> } | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => { setFetched(null); bump((n) => n + 1); };
    window.addEventListener(LEG_TIMES_EVENT, on);
    return () => window.removeEventListener(LEG_TIMES_EVENT, on);
  }, []);
  const real = fetched?.key === key ? fetched.pill : toPill(cachedLegTimes(from, to));
  useEffect(() => {
    if (cachedLegTimes(from, to) || !navigator.onLine || !hasGoogleKey()) return;
    let alive = true;
    legTimes(from, to, straight).then((t) => { if (alive) setFetched({ key, pill: toPill(t) }); }).catch(() => { /* keep the estimate */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return real ?? { mode: leg.mode, minutes: leg.minutes, km: leg.km, real: false };
}

/** The leg sheet opens on the same mode the timeline shows. */
export const sheetMode = (m: PillMode): Mode => (m === "walk" ? "WALKING" : m === "transit" ? "TRANSIT" : "DRIVING");
