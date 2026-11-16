import type { Booking, Item } from "./types";
import { toMinutes } from "./clock";

/** Where "now" falls in a day's ordered items. Items without a time follow the one before them. */
export interface NowState {
  /** items already behind us (their time passed, or ticked off before the next one) */
  readonly past: ReadonlySet<string>;
  /** the next timed item still ahead, or null when the day is over */
  readonly next: Item | null;
  /** index in the list before which the "now" line sits; list length when the day is over */
  readonly lineAt: number;
}

export function nowState(items: readonly Item[], time: string): NowState {
  const now = toMinutes(time);
  const nextIdx = items.findIndex((it) => it.time !== "" && toMinutes(it.time) > now && !it.done);
  const lineAt = nextIdx === -1 ? items.length : nextIdx;
  const past = new Set(items.slice(0, lineAt).map((it) => it.id));
  return { past, next: nextIdx === -1 ? null : items[nextIdx], lineAt };
}

/** When to leave for the next item, given the travel minutes; null without a time. */
export function leaveBy(next: Item, travelMinutes: number, time: string): { at: number; left: number } | null {
  if (!next.time) return null;
  const at = toMinutes(next.time) - travelMinutes;
  return { at, left: at - toMinutes(time) };
}

/**
 * Date of a booking from its free text ("12/4 10:30", "12/3 – 12/5" → the first date).
 * The year follows the trip: a month before the trip's start month belongs to the next year.
 */
export function bookingDate(b: Pick<Booking, "when">, tripStart: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(b.when);
  if (!m) return null;
  const [y, sm] = tripStart.split("-").map(Number);
  const mo = Number(m[1]);
  const year = mo < sm ? y + 1 : y;
  return `${year}-${String(mo).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}
