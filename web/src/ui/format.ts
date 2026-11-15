const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-12-03" → Date at local midnight (dates are trip-local, never shifted by timezone). */
export const parseDay = (d: string) => new Date(`${d}T00:00:00`);
export const weekday = (d: string) => WEEK[parseDay(d).getDay()];
export const dayLabel = (d: string) => {
  const x = parseDay(d);
  return `${x.getMonth() + 1}월 ${x.getDate()}일 ${WEEK[x.getDay()]}요일`;
};
export const shortDay = (d: string) => {
  const x = parseDay(d);
  return `${x.getMonth() + 1}.${x.getDate()} ${WEEK[x.getDay()]}`;
};
export const clock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const stamp = (ms: number) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? clock(ms) : `${d.getMonth() + 1}/${d.getDate()} ${clock(ms)}`;
};
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
