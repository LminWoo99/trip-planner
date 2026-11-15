import { useState } from "react";
import { Check } from "lucide-react";
import { update, useApp } from "../app/store";
import { findPlace, hasGoogleKey, type FoundPlace } from "../infra/google";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";

interface Row {
  readonly collection: "items" | "places";
  readonly id: string;
  readonly label: string;
  readonly query: string;
  readonly city: string;
  readonly link: string;
}

/** Finds Google places for imported stops that have a name but no position; nothing is saved until confirmed. */
export function FillLocationsSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const [found, setFound] = useState<Record<string, FoundPlace | null>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"" | "search" | "save">("");
  if (!snapshot) return null;

  const cityOf = new Map(snapshot.days.map((d) => [d.id, d.city]));
  const rows: Row[] = [
    ...snapshot.items.filter((i) => i.place && i.lat === null).map((i) => ({
      collection: "items" as const, id: i.id, label: i.title, query: i.place, city: cityOf.get(i.day) ?? "", link: i.link,
    })),
    ...snapshot.places.filter((p) => p.lat === null).map((p) => ({
      collection: "places" as const, id: p.id, label: p.name, query: p.q || p.name, city: p.city, link: p.link,
    })),
  ];

  async function search() {
    setBusy("search");
    const next: Record<string, FoundPlace | null> = {};
    const pick = new Set<string>();
    for (const r of rows) {
      try { next[r.id] = await findPlace(r.query, r.city); } catch { next[r.id] = null; }
      if (next[r.id]) pick.add(r.id);
      setFound({ ...next });
      setChosen(new Set(pick));
    }
    setBusy("");
  }

  async function save() {
    setBusy("save");
    const targets = rows.filter((r) => chosen.has(r.id) && found[r.id]);
    const ok = await attempt(() => Promise.all(targets.map((r) => {
      const f = found[r.id]!;
      return update(r.collection, r.id, { lat: f.lat, lng: f.lng, placeId: f.placeId, ...(r.link ? {} : { link: f.url }) });
    })), `${targets.length}곳의 위치를 채웠어요`);
    setBusy("");
    if (ok) onClose();
  }

  const progress = Object.keys(found).length;
  const searched = progress > 0 && busy !== "search";
  return (
    <Sheet
      title="위치 없는 장소 채우기"
      onClose={onClose}
      footer={searched
        ? <button className="btn primary" disabled={busy !== "" || chosen.size === 0} onClick={save}>선택한 {chosen.size}곳 저장</button>
        : <button className="btn primary" disabled={busy !== "" || rows.length === 0 || !hasGoogleKey()} onClick={search}>{busy === "search" ? `찾는 중이에요 (${progress}/${rows.length})` : `${rows.length}곳 Google에서 찾기`}</button>}
    >
      {rows.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>위치가 빠진 장소가 없어요.</p> : (
        <>
          <p className="keep" style={{ margin: 0, fontSize: 13, color: "var(--ink2)" }}>찾은 결과를 확인하고, 맞는 것만 체크해서 저장하세요.</p>
          <div className="list" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
            {rows.map((r) => {
              const f = found[r.id];
              const done = r.id in found;
              return (
                <div key={r.id} className="li with-check">
                  <button className="check" style={{ margin: 0 }} role="checkbox" aria-checked={chosen.has(r.id)} disabled={!f} aria-label={`${r.label} 저장`}
                    onClick={() => { const s = new Set(chosen); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); setChosen(s); }}>
                    <span className="box"><Check className="icon" /></span>
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div className="li-title">{r.label}</div>
                    <div className="li-sub keep">
                      {!done ? r.query : f ? `${f.name}, ${f.address}` : <span style={{ color: "var(--danger)" }}>못 찾았어요. 일정 카드에서 직접 검색해 주세요.</span>}
                    </div>
                  </div>
                  <span />
                </div>
              );
            })}
          </div>
          {searched && <div className="suggest-attr" style={{ border: 0 }}>Powered by Google</div>}
        </>
      )}
    </Sheet>
  );
}
