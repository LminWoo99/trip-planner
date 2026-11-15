import { useEffect, useRef, useState } from "react";
import { Navigation } from "lucide-react";
import type { Item } from "../../domain/types";
import { gmapsRoute } from "../../domain/geo";
import { hasGoogleKey, loadMaps } from "../../infra/google";

export interface MapStop {
  readonly n: number;
  readonly item: Item;
}

// quiet gray base map so the numbered stops carry the color
const MONO: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ saturation: -100 }, { lightness: 8 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7178" }] },
  { elementType: "labels.icon", stylers: [{ saturation: -100 }, { lightness: 30 }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d9dde2" }] },
];

const SAPA = { lat: 22.3364, lng: 103.8438 };

export function DayMap({ stops, note, terrain }: { stops: readonly MapStop[]; note: string; terrain: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const overlays = useRef<(google.maps.Marker | google.maps.Polyline)[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline" | "nokey">(hasGoogleKey() ? "loading" : "nokey");
  const located = stops.filter((s) => s.item.lat !== null && s.item.lng !== null);

  useEffect(() => {
    if (!hasGoogleKey()) return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    let alive = true;
    loadMaps().then(({ Map }) => {
      if (!alive || !el.current) return;
      map.current = new Map(el.current, {
        center: SAPA, zoom: 13, styles: MONO, disableDefaultUI: true, gestureHandling: "cooperative", clickableIcons: false,
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
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#1b1d21", scale: 2 }, offset: "0", repeat: "10px" }],
      }));
    }
    located.forEach((s, i) => {
      overlays.current.push(new google.maps.Marker({
        map: m,
        position: pts[i],
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: "#1b1d21", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
        label: { text: String(s.n), color: "#ffffff", fontSize: "11px", fontWeight: "700" },
        title: s.item.title,
      }));
    });
    if (pts.length === 1) { m.setCenter(pts[0]); m.setZoom(15); }
    else if (pts.length > 1) {
      const b = new google.maps.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      m.fitBounds(b, 28);
      google.maps.event.addListenerOnce(m, "idle", () => { if ((m.getZoom() ?? 0) > 16) m.setZoom(16); });
    } else { m.setCenter(SAPA); m.setZoom(13); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, status]);

  const route = gmapsRoute(stops.filter((s) => s.item.place).map((s) => s.item));

  return (
    <div className="map">
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="오늘 동선 지도" />
      {status === "offline" && <div className="map-empty">오프라인이라 지도를 못 불러와요</div>}
      {status === "nokey" && <div className="map-empty">지도 키가 설정되지 않았어요</div>}
      {status === "ready" && located.length === 0 && <div className="map-empty">위치가 등록된 장소가 없어요</div>}
      <span className="map-note">{note}</span>
      {route && (
        <a className="map-route" href={route} target="_blank" rel="noopener noreferrer"><Navigation className="icon" />구글맵 동선</a>
      )}
    </div>
  );
}
