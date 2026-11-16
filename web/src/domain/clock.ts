// Wall-clock time at the destination. Item times and day dates are local to the trip,
// so "today" and "now" must be read in the destination's time zone, not the phone's.

export interface LocalNow {
  readonly date: string; // YYYY-MM-DD
  readonly time: string; // HH:MM
}

const parts = (d: Date, tz: string) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
};

export function localNow(tz: string, now: Date): LocalNow {
  const p = parts(now, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** "2026-12-04" + "10:30" in Asia/Ho_Chi_Minh → the absolute instant, wherever the phone is. */
export function zonedDate(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    t += wall - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  }
  return new Date(t);
}

export const formatHm = (d: Date, tz: string) => localNow(tz, d).time;

export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const fromMinutes = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
