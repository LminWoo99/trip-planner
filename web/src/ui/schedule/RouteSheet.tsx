import { useEffect, useRef, useState } from "react";
import { Footprints, Navigation, Pencil } from "lucide-react";
import type { Item } from "../../domain/types";
import { courseKm, estimateLeg, formatKm, formatMinutes, gmapsWalk, isSameSpot } from "../../domain/geo";
import { hasGoogleKey, loadMaps } from "../../infra/google";
import { Sheet } from "../Sheet";
import { Linkified } from "./DayHead";

const PIN = "#5b4fe0";

/** A course inside one item: map of its stops, the order with walking legs, and the full memo. */
export function RouteSheet({ item, onClose, onEdit }: { item: Item; onClose: () => void; onEdit: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "off">(hasGoogleKey() && navigator.onLine ? "loading" : "off");
  const stops = item.stops;
  const located = stops.filter((s) => s.lat !== null && s.lng !== null);
  const km = courseKm(stops);
  const walk = gmapsWalk(stops.map((s) => ({ place: s.name, placeId: s.placeId })));

  useEffect(() => {
    if (mapState === "off" || !el.current || located.length === 0) return;
    let alive = true;
    loadMaps().then(({ Map }) => {
      if (!alive || !el.current) return;
      const pts = located.map((s) => ({ lat: s.lat!, lng: s.lng! }));
      const m = new Map(el.current, { center: pts[0], zoom: 14, disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false, mapTypeId: "terrain" });
      new google.maps.Polyline({ map: m, path: pts, strokeColor: PIN, strokeOpacity: 0.85, strokeWeight: 4 });
      pts.forEach((p, i) => new google.maps.Marker({
        map: m, position: p, zIndex: 100 + i,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: PIN, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
        label: { text: String(stops.indexOf(located[i]) + 1), color: "#fff", fontSize: "11px", fontWeight: "700" },
      }));
      if (pts.length > 1) {
        const b = new google.maps.LatLngBounds();
        pts.forEach((p) => b.extend(p));
        m.fitBounds(b, 32);
      }
      setMapState("ready");
    }).catch(() => alive && setMapState("off"));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Sheet title={item.title} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onEdit}><Pencil className="icon" />고치기</button>
      {walk && <a className="btn primary" style={{ textDecoration: "none" }} href={walk} target="_blank" rel="noopener noreferrer"><Navigation className="icon" />구글맵 도보 길찾기</a>}
    </>}>
      <div className="li-sub num" style={{ marginTop: 0, fontSize: 14, color: "var(--ink2)" }}>
        <span>경유 {stops.length}곳</span>{km > 0 && <span>약 {formatKm(km)}</span>}{km > 0 && <span>걸어서 {formatMinutes(Math.round((km / 4) * 60))} 안팎</span>}
      </div>
      {located.length > 0 && (
        <div className="route-map">
          <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="코스 지도" />
          {mapState === "off" && <div className="map-empty">{navigator.onLine ? "지도를 불러오지 못했어요" : "오프라인이라 지도를 못 불러와요"}</div>}
        </div>
      )}
      <ol className="route-list">
        {stops.map((s, i) => {
          const prev = i > 0 ? stops[i - 1] : null;
          const a = prev && prev.lat !== null && prev.lng !== null ? { lat: prev.lat, lng: prev.lng } : null;
          const b = s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng } : null;
          const leg = a && b && !isSameSpot(a, b) ? estimateLeg(a, b) : null;
          return (
            <li key={`${s.name}-${i}`}>
              {leg && <div className="route-leg"><Footprints className="icon" />{formatKm(leg.km)}, 걸어서 약 {formatMinutes(Math.round((leg.km / 4) * 60))}</div>}
              <div className="route-stop">
                <span className="route-n">{i + 1}</span>
                <span className="keep">{s.name}{s.lat === null && <small style={{ color: "var(--danger)", marginLeft: 6 }}>위치 없음</small>}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {item.memo && (
        <div>
          <div className="group-label" style={{ margin: "4px 0 6px" }}>메모</div>
          <p className="keep" style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", color: "var(--ink2)" }}><Linkified text={item.memo} /></p>
        </div>
      )}
    </Sheet>
  );
}
