// Place search → coordinates via OSM Nominatim (one request per explicit tap, within its usage policy).
// Searching inside the day's area first stops "Phở Hà Nội Sapa" from landing in Hanoi.

const AREAS: Record<string, string> = {
  사파: "103.70,22.45,103.95,22.22",
  하노이: "105.60,21.30,106.00,20.90",
};

/** Areas named in a day's city text like "사파 → 하노이", last leg first. */
export function areasFor(city: string): string[] {
  const names = city.split("→").map((s) => s.trim()).reverse();
  return [...new Set(names.flatMap((n) => Object.keys(AREAS).filter((a) => n.includes(a))))];
}

async function search(q: string, viewbox?: string) {
  const params = new URLSearchParams({ format: "json", limit: "1", countrycodes: "vn", "accept-language": "ko,en", q });
  if (viewbox) { params.set("viewbox", viewbox); params.set("bounded", "1"); }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

export async function geocode(q: string, city = ""): Promise<{ lat: number; lng: number } | null> {
  try {
    const areas = areasFor(city);
    for (const area of areas) {
      const hit = await search(q, AREAS[area]);
      if (hit) return hit;
    }
    // a known area found nothing: better no pin than a same-named place in another city
    return areas.length ? null : await search(q);
  } catch {
    return null;
  }
}
