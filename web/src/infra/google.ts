import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

// Google Maps Platform: Places (search) and Maps (day map).
// The key is browser-exposed by design; it is restricted to this site's referrers and to these two APIs.

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
let configured = false;

export const hasGoogleKey = () => Boolean(KEY);

function configure() {
  if (configured) return;
  if (!KEY) throw new Error("NO_GOOGLE_KEY");
  setOptions({ key: KEY, v: "weekly", language: "ko" });
  configured = true;
}

export async function loadMaps() {
  configure();
  return importLibrary("maps");
}

async function loadPlaces() {
  configure();
  return importLibrary("places");
}

// Search near the trip's areas first; a day in Sa Pa shouldn't suggest a same-named place in Hanoi.
const AREAS: Record<string, google.maps.LatLngLiteral & { radius: number }> = {
  사파: { lat: 22.3364, lng: 103.8438, radius: 15000 },
  하노이: { lat: 21.0285, lng: 105.8542, radius: 30000 },
};

export function areaFor(city: string) {
  const last = city.split("→").pop() ?? "";
  const key = Object.keys(AREAS).find((k) => last.includes(k)) ?? Object.keys(AREAS).find((k) => city.includes(k));
  return key ? AREAS[key] : null;
}

const biasFor = (city: string): google.maps.CircleLiteral | undefined => {
  const a = areaFor(city);
  return a ? { center: { lat: a.lat, lng: a.lng }, radius: a.radius } : undefined;
};

export interface Suggestion {
  readonly placeId: string;
  readonly main: string;
  readonly secondary: string;
  readonly prediction: google.maps.places.PlacePrediction;
}

export interface FoundPlace {
  readonly placeId: string;
  readonly name: string;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
  readonly url: string;
  readonly primaryType: string;
}

/** One search session: many keystrokes, one selection. Billed as a single session. */
export class PlaceSearchSession {
  private token: google.maps.places.AutocompleteSessionToken | null = null;

  async suggest(input: string, city: string): Promise<Suggestion[]> {
    const places = await loadPlaces();
    this.token ??= new places.AutocompleteSessionToken();
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken: this.token,
      locationBias: biasFor(city),
      language: "ko",
    });
    return suggestions.flatMap((s) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [{ placeId: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "", prediction: p }];
    });
  }

  async select(s: Suggestion): Promise<FoundPlace | null> {
    const place = s.prediction.toPlace();
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "googleMapsURI"] });
    this.token = null; // the session ends with the details call
    return toFound(place);
  }
}

export interface RatedPlace extends FoundPlace {
  readonly rating: number;
  readonly reviews: number;
}

/**
 * Of a few named candidates, the best-reviewed one on Google: highest rating among places with
 * enough reviews to trust (30+), falling back to the most reviewed. One text search per candidate.
 */
export async function bestRated(names: readonly string[], city: string): Promise<RatedPlace | null> {
  const places = await loadPlaces();
  const found = await Promise.all(names.slice(0, 3).map(async (name) => {
    try {
      const { places: hits } = await places.Place.searchByText({
        textQuery: name,
        fields: ["displayName", "formattedAddress", "location", "googleMapsURI", "primaryType", "rating", "userRatingCount"],
        locationBias: biasFor(city),
        language: "ko",
        maxResultCount: 1,
      });
      const p = hits[0];
      const f = p ? toFound(p) : null;
      return f ? { ...f, rating: p.rating ?? 0, reviews: p.userRatingCount ?? 0 } : null;
    } catch {
      return null;
    }
  }));
  const ok = found.filter((p): p is RatedPlace => !!p);
  const trusted = ok.filter((p) => p.reviews >= 30).sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  return trusted[0] ?? ok.sort((a, b) => b.reviews - a.reviews)[0] ?? null;
}

/** Best match for free text, used to fill in places that were imported without coordinates. */
export async function findPlace(query: string, city: string): Promise<FoundPlace | null> {
  const places = await loadPlaces();
  const { places: hits } = await places.Place.searchByText({
    textQuery: query,
    fields: ["displayName", "formattedAddress", "location", "googleMapsURI", "primaryType"],
    locationBias: biasFor(city),
    language: "ko",
    maxResultCount: 1,
  });
  return hits[0] ? toFound(hits[0]) : null;
}

function toFound(p: google.maps.places.Place): FoundPlace | null {
  if (!p.location) return null;
  return {
    placeId: p.id,
    name: p.displayName ?? "",
    address: p.formattedAddress ?? "",
    lat: p.location.lat(),
    lng: p.location.lng(),
    url: p.googleMapsURI ?? "",
    primaryType: p.primaryType ?? "",
  };
}

/** Google place type → our place kind. */
export function kindOf(primaryType: string): "food" | "cafe" | "sight" | "stay" | "shop" | "etc" {
  const t = primaryType.toLowerCase();
  if (/cafe|coffee|bakery|tea/.test(t)) return "cafe";
  if (/restaurant|food|bar|meal|diner/.test(t)) return "food";
  if (/lodging|hotel|hostel|resort|guest_house|inn/.test(t)) return "stay";
  if (/store|shop|market|mall/.test(t)) return "shop";
  if (/tourist|attraction|museum|park|church|temple|viewpoint|landmark|village|hiking/.test(t)) return "sight";
  return "etc";
}
