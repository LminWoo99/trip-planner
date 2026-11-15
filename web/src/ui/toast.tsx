import { useSyncExternalStore } from "react";

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function toast(text: string) {
  message = text;
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => { message = null; listeners.forEach((l) => l()); }, 2600);
}

/** Runs a write and shows its error as a toast instead of failing silently. */
export async function attempt(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
  try {
    await fn();
    if (done) toast(done);
    return true;
  } catch (e) {
    const err = e as { message?: string; status?: number };
    toast(err.status === 0 || !navigator.onLine ? "연결이 끊겨서 저장하지 못했어요." : err.message && /[가-힣]/.test(err.message) ? err.message : "저장하지 못했어요. 다시 해 주세요.");
    return false;
  }
}

export function Toast() {
  const text = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => message);
  return text ? <div className="toast" role="status">{text}</div> : null;
}
