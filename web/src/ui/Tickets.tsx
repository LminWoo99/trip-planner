import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Copy, X } from "lucide-react";
import type { Booking } from "../domain/types";
import { fileUrl } from "../infra/photos";
import { useFileToken } from "./Photos";
import { toast } from "./toast";

/** Small ticket thumbnails on a booking; tap to open the full-screen viewer. */
export function TicketStrip({ booking }: { booking: Booking }) {
  const tok = useFileToken(booking.files.length > 0);
  const [open, setOpen] = useState<number | null>(null);
  if (!booking.files.length) return null;
  return (
    <>
      <div className="photo-strip">
        {booking.files.map((f, i) => (
          <button key={f} type="button" className="photo-thumb" onClick={() => setOpen(i)} aria-label={`${booking.title} 티켓 ${i + 1} 크게 보기`}>
            {tok && <img src={fileUrl("bookings", booking.id, f, tok, "240x240")} alt="" loading="lazy" />}
          </button>
        ))}
      </div>
      {open !== null && <TicketViewer booking={booking} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * Full-screen ticket for showing at a counter: dark background, booking number large with copy,
 * screen kept awake where the phone allows it. Images come from the phone's cache when offline.
 */
export function TicketViewer({ booking, start = 0, onClose }: { booking: Booking; start?: number; onClose: () => void }) {
  const tok = useFileToken(true);
  const [i, setI] = useState(start);
  const touch = useRef<number | null>(null);
  const n = booking.files.length;
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => { /* not supported */ });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { void lock?.release(); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  // offline the token request fails; any token string still hits the cache (keyed without it)
  const src = n ? fileUrl("bookings", booking.id, booking.files[i], tok ?? "offline") : null;

  async function copyCode() {
    try { await navigator.clipboard.writeText(booking.code); toast("예약번호를 복사했어요"); } catch { toast("복사하지 못했어요"); }
  }

  // portal: list rows clip fixed children on iOS
  return createPortal(
    <div className="ticket-view" role="dialog" aria-modal="true" aria-label={`${booking.title} 티켓`}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s === null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <div className="tv-top">
        <button className="icon-btn" style={{ color: "#fff" }} onClick={onClose} aria-label="닫기"><X className="icon" /></button>
        <b className="keep">{booking.title}</b>
        {n > 1 && <span className="num">{i + 1} / {n}</span>}
      </div>
      <div className="tv-img">{src ? <img src={src} alt={`티켓 ${i + 1}`} /> : <p>붙인 티켓이 없어요</p>}</div>
      {booking.code && (
        <div className="tv-code">
          <div><small>예약번호</small><b className="num">{booking.code}</b></div>
          <button onClick={copyCode}><Copy className="icon" />복사</button>
        </div>
      )}
      <p className="tv-note"><CircleCheck className="icon" />이 폰에 저장돼 있어 인터넷 없이 열려요.</p>
      {n > 1 && <div className="tv-dots">{booking.files.map((f, k) => <i key={f} className={k === i ? "on" : ""} />)}</div>}
    </div>,
    document.body,
  );
}
