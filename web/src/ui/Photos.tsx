import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { fileToken, photoUrl } from "../infra/photos";

/** Current file token for protected photos; renewed while the screen is open. */
export function useFileToken(enabled: boolean): string | null {
  const [tok, setTok] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => fileToken().then((t) => alive && setTok(t)).catch(() => { /* offline: cached images still show */ });
    load();
    const id = setInterval(load, 80_000);
    return () => { alive = false; clearInterval(id); };
  }, [enabled]);
  return tok;
}

/** Small thumbnails under a memo; tap to open the viewer. */
export function PhotoStrip({ itemId, photos }: { itemId: string; photos: readonly string[] }) {
  const tok = useFileToken(photos.length > 0);
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const shown = photos.slice(0, 4);
  return (
    <>
      <div className="photo-strip">
        {shown.map((f, i) => (
          <button key={f} type="button" className="photo-thumb" onClick={() => setOpen(i)} aria-label={`사진 ${i + 1} 크게 보기`}>
            {tok && <img src={photoUrl(itemId, f, tok, "240x240")} alt="" loading="lazy" />}
            {i === shown.length - 1 && photos.length > shown.length && <span className="photo-more">+{photos.length - shown.length}</span>}
          </button>
        ))}
      </div>
      {open !== null && tok && <PhotoViewer itemId={itemId} photos={photos} start={open} token={tok} onClose={() => setOpen(null)} />}
    </>
  );
}

export function PhotoViewer({ itemId, photos, start, token, onClose }: { itemId: string; photos: readonly string[]; start: number; token: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touch = useRef<number | null>(null);
  const go = (d: number) => setI((x) => Math.max(0, Math.min(photos.length - 1, x + d)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="사진 보기"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (s === null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <img src={photoUrl(itemId, photos[i], token, "1200x0")} alt={`사진 ${i + 1}`} />
      <div className="viewer-bar">
        <span className="num">{i + 1} / {photos.length}</span>
        <button className="icon-btn" style={{ color: "#fff" }} onClick={onClose} aria-label="닫기"><X className="icon" /></button>
      </div>
      {i > 0 && <button className="viewer-nav left" onClick={() => go(-1)} aria-label="이전 사진"><ChevronLeft className="icon" /></button>}
      {i < photos.length - 1 && <button className="viewer-nav right" onClick={() => go(1)} aria-label="다음 사진"><ChevronRight className="icon" /></button>}
    </div>
  );
}

/** Edit attached photos: existing ones can be removed, new ones previewed before saving. */
export function PhotoPicker({ itemId, existing, removed, added, max = 6, onRemoveExisting, onAdd, onRemoveAdded }: {
  itemId: string | null;
  existing: readonly string[];
  removed: ReadonlySet<string>;
  added: readonly File[];
  max?: number;
  onRemoveExisting: (f: string) => void;
  onAdd: (files: File[]) => void;
  onRemoveAdded: (i: number) => void;
}) {
  const tok = useFileToken(existing.length > 0);
  const kept = existing.filter((f) => !removed.has(f));
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = added.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [added]);
  const room = max - kept.length - added.length;

  return (
    <div className="photo-strip edit">
      {kept.map((f) => (
        <span key={f} className="photo-thumb">
          {tok && itemId && <img src={photoUrl(itemId, f, tok, "240x240")} alt="" />}
          <button type="button" className="photo-x" aria-label="사진 빼기" onClick={() => onRemoveExisting(f)}><X className="icon" /></button>
        </span>
      ))}
      {previews.map((u, i) => (
        <span key={u} className="photo-thumb">
          <img src={u} alt="" />
          <button type="button" className="photo-x" aria-label="사진 빼기" onClick={() => onRemoveAdded(i)}><X className="icon" /></button>
        </span>
      ))}
      {room > 0 && (
        <label className="photo-thumb photo-add">
          <ImagePlus className="icon" /><span>사진</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])].slice(0, room); if (fs.length) onAdd(fs); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}
