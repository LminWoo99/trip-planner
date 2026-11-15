import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CENTER: Record<string, [number, number]> = { 사파: [22.3364, 103.8438], 하노이: [21.0285, 105.8542] };

/** Tap the map to set a stop's position when search can't find it. */
export function LocationPicker({ value, city, onChange }: { value: { lat: number; lng: number } | null; city: string; onChange: (v: { lat: number; lng: number }) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!el.current) return;
    const area = Object.keys(CENTER).find((k) => city.split("→").pop()?.includes(k)) ?? "사파";
    const start: [number, number] = value ? [value.lat, value.lng] : CENTER[area];
    const m = L.map(el.current, { attributionControl: false }).setView(start, value ? 16 : 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
    const icon = L.divIcon({ className: "", html: '<div class="map-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
    if (value) marker.current = L.marker(start, { icon }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      marker.current?.remove();
      marker.current = L.marker(e.latlng, { icon }).addTo(m);
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} style={{ height: 220, borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)" }} aria-label="지도를 눌러 위치 지정" />;
}
