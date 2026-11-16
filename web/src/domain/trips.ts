// Trip list logic: where a trip stands relative to today, and how its dates read.

export interface TripSummary {
  readonly id: string;
  readonly title: string;
  readonly start: string; // YYYY-MM-DD
  readonly end: string;
  readonly cities: readonly string[];
  /** day titles by date, for "오늘: 판시판" while travelling */
  readonly dayTitles: Readonly<Record<string, string>>;
}

export type TripStatus =
  | { readonly kind: "upcoming"; readonly dday: number }
  | { readonly kind: "ongoing"; readonly dayN: number }
  | { readonly kind: "past" };

const toUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);

export function tripStatus(t: { start: string; end: string }, today: string): TripStatus {
  if (today < t.start) return { kind: "upcoming", dday: daysBetween(today, t.start) };
  if (today <= t.end) return { kind: "ongoing", dayN: daysBetween(t.start, today) + 1 };
  return { kind: "past" };
}

/** "4박 5일", or "당일치기" for a single day. */
export function nightsLabel(t: { start: string; end: string }): string {
  const days = daysBetween(t.start, t.end) + 1;
  return days <= 1 ? "당일치기" : `${days - 1}박 ${days}일`;
}

/** Upcoming and ongoing first (soonest first), then past trips (most recent first). */
export function sortTrips<T extends { start: string; end: string }>(trips: readonly T[], today: string): { coming: T[]; past: T[] } {
  const coming = trips.filter((t) => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const past = trips.filter((t) => t.end < today).sort((a, b) => b.start.localeCompare(a.start));
  return { coming, past };
}

/** Distinct place names from day cities like "인천 → 하노이 → 사파", in first-seen order. */
export function citiesOf(dayCities: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of dayCities) {
    for (const part of c.split("→").map((s) => s.trim()).filter(Boolean)) {
      if (!out.includes(part)) out.push(part);
    }
  }
  return out;
}
