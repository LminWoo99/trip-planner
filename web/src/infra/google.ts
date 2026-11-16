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
