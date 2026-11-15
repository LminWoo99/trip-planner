import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation } from "lucide-react";
import type { Item } from "../../domain/types";
import { gmapsRoute } from "../../domain/geo";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// contour map on trekking days
const TOPO = "https://a.tile.opentopomap.org/{z}/{x}/{y}.png";

export interface MapStop {
  readonly n: number;
  readonly item: Item;
}

export function DayMap({ stops, note, topo }: { stops: readonly MapStop[]; note: string; topo: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const located = stops.filter((s) => s.item.lat !== null && s.item.lng !== null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    tiles.current?.remove();
    tiles.current = L.tileLayer(topo ? TOPO : OSM, { maxZoom: 17 }).addTo(map.current);
  }, [topo]);

  const key = located.map((s) => `${s.n}:${s.item.lat},${s.item.lng}`).join("|");
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts = located.map((s) => L.latLng(s.item.lat!, s.item.lng!));
    if (pts.length > 1) L.polyline(pts, { color: "#1b1d21", weight: 1.6, dashArray: "4 4" }).addTo(g);
    located.forEach((s, i) => {
      L.marker(pts[i], {
        icon: L.divIcon({ className: "", html: `<div class="map-pin">${s.n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        keyboard: false,
      }).addTo(g);
    });
    if (pts.length === 1) m.setView(pts[0], 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 16 });
    else m.setView([22.3364, 103.8438], 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const route = gmapsRoute(stops.filter((s) => s.item.place).map((s) => s.item.place));

  return (
    <div className="map">
      <div ref={el} style={{ position: "absolute", inset: 0 }} aria-label="오늘 동선 지도" role="img" />
      {located.length === 0 && <div className="map-empty">위치가 등록된 장소가 없어요</div>}
      <span className="map-note">{note}</span>
      {route && (
        <a className="map-route" href={route} target="_blank" rel="noopener noreferrer"><Navigation className="icon" />구글맵 동선</a>
      )}
    </div>
  );
}
