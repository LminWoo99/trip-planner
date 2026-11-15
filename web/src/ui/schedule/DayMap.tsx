import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Navigation } from "lucide-react";
import type { Item } from "../../domain/types";
import { gmapsRoute } from "../../domain/geo";
import { hasGoogleKey, loadMaps } from "../../infra/google";

export interface MapStop {
  readonly n: number;
  readonly item: Item;
}

// the map keeps Google's own colors (easier to read); stops get one strong color so they stand out on it
const PIN = "#5b4fe0";

const SAPA = { lat: 22.3364, lng: 103.8438 };

export function DayMap({ stops, note, terrain }: { stops: readonly MapStop[]; note: string; terrain: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<(google.maps.Marker | google.maps.Polyline)[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline" | "nokey">(hasGoogleKey() ? "loading" : "nokey");
  const [big, setBig] = useState(false);
  const located = stops.filter((s) => s.item.lat !== null && s.item.lng !== null);
  const missing = stops.length - located.length;

  useEffect(() => {
    if (!hasGoogleKey()) return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    let alive = true;
    loadMaps().then(({ Map }) => {
      if (!alive || !el.current) return;
      map.current = new Map(el.current, {
        center: SAPA, zoom: 13, disableDefaultUI: true, gestureHandling: "cooperative", clickableIcons: false,
      });
      setStatus("ready");
    }).catch(() => alive && setStatus("offline"));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    map.current?.setMapTypeId(terrain ? "terrain" : "roadmap");
  }, [terrain, status]);

  const key = located.map((s) => `${s.n}:${s.item.lat},${s.item.lng}`).join("|");
  useEffect(() => {
    const m = map.current;
    if (!m || status !== "ready") return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const pts = located.map((s) => ({ lat: s.item.lat!, lng: s.item.lng! }));
    if (pts.length > 1) {
      overlays.current.push(new google.maps.Polyline({
        map: m, path: pts, strokeOpacity: 0,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.8, strokeColor: "#565d66", scale: 3 }, offset: "0", repeat: "12px" }],
      }));
    }
    located.forEach((s, i) => {
      overlays.current.push(new google.maps.Marker({
        map: m,
        position: pts[i],
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: PIN, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2.5 },
        label: { text: String(s.n), color: "#ffffff", fontSize: "13px", fontWeight: "700" },
        zIndex: 100 + s.n,
        title: s.item.title,
      }));
    });
    fitAll(m, pts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, status]);

  // re-frame every stop after the map grows or shrinks
  useEffect(() => {
    const m = map.current;
    if (!m || status !== "ready") return;
    m.setOptions({ gestureHandling: big ? "greedy" : "cooperative" });
    const t = setTimeout(() => fitAll(m, located.map((s) => ({ lat: s.item.lat!, lng: s.item.lng! }))), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [big]);

  const route = gmapsRoute(stops.filter((s) => s.item.place).map((s) => s.item));

  return (
    <div className={`map ${big ? "big" : ""}`}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="오늘 동선 지도" />
      {status === "offline" && <div className="map-empty">오프라인이라 지도를 못 불러와요</div>}
      {status === "nokey" && <div className="map-empty">지도 키가 설정되지 않았어요</div>}
      {status === "ready" && located.length === 0 && <div className="map-empty">위치가 등록된 장소가 없어요</div>}
      <span className="map-note">{note}{missing > 0 ? `, ${missing}곳 위치 없음` : ""}</span>
      {status === "ready" && (
        <button className="map-expand" onClick={() => setBig(!big)} aria-label={big ? "지도 작게 보기" : "지도 크게 보기"}>
          {big ? <Minimize2 className="icon" /> : <Maximize2 className="icon" />}
        </button>
      )}
      {route && (
        <a className="map-route" href={route} target="_blank" rel="noopener noreferrer"><Navigation className="icon" />구글맵 동선</a>
      )}
    </div>
  );
}

/** Frame all stops with room for the pins; never zoom in past street level. */
function fitAll(m: google.maps.Map, pts: google.maps.LatLngLiteral[]) {
  if (pts.length === 0) { m.setCenter(SAPA); m.setZoom(13); return; }
  if (pts.length === 1) { m.setCenter(pts[0]); m.setZoom(15); return; }
  const b = new google.maps.LatLngBounds();
  pts.forEach((p) => b.extend(p));
  m.fitBounds(b, { top: 36, bottom: 48, left: 36, right: 36 });
  google.maps.event.addListenerOnce(m, "idle", () => { if ((m.getZoom() ?? 0) > 16) m.setZoom(16); });
}
