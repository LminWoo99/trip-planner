import { useState } from "react";
import { Check, Upload } from "lucide-react";
import { create, useApp } from "../app/store";
import { findPlace, hasGoogleKey, kindOf, type FoundPlace } from "../infra/google";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";
import { PLACE_TYPES } from "./PlacesScreen";
import { parseTakeoutCsv } from "../domain/takeout";

interface Entry {
  readonly key: string;
  readonly name: string;
  readonly note: string;
}

/**
 * Several places at once: paste names (one per line) or upload a Google Takeout "Saved" list CSV.
 * Each name is looked up on Google near the chosen city, then saved only after confirmation.
 */
export function ImportPlacesSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const [text, setText] = useState("");
  const [city, setCity] = useState("사파");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [found, setFound] = useState<Record<string, FoundPlace | null>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"" | "search" | "save">("");
  if (!snapshot) return null;

  const existingIds = new Set(snapshot.places.map((p) => p.placeId).filter(Boolean));
  const existingNames = new Set(snapshot.places.map((p) => p.name.trim().toLowerCase()));

  async function onFile(file: File) {
    const rows = parseTakeoutCsv(await file.text());
    setText(rows.map((r) => (r.note ? `${r.name} | ${r.note}` : r.name)).join("\n"));
  }

  async function search() {
    const list = text.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const [name, ...note] = l.split("|");
      return { key: `${i}`, name: name.trim(), note: note.join("|").trim() };
    });
    setEntries(list);
    setBusy("search");
    const next: Record<string, FoundPlace | null> = {};
    const pick = new Set<string>();
    for (const e of list) {
      try { next[e.key] = await findPlace(e.name, city); } catch { next[e.key] = null; }
      const f = next[e.key];
      if (f && !existingIds.has(f.placeId) && !existingNames.has(f.name.trim().toLowerCase())) pick.add(e.key);
      setFound({ ...next });
      setChosen(new Set(pick));
    }
    setBusy("");
  }

  async function save() {
    setBusy("save");
    const targets = (entries ?? []).filter((e) => chosen.has(e.key) && found[e.key]);
    const ok = await attempt(() => Promise.all(targets.map((e) => {
      const f = found[e.key]!;
      return create("places", {
        name: e.name, city, type: kindOf(f.primaryType), q: f.name || e.name,
        memo: e.note, link: f.url, lat: f.lat, lng: f.lng, placeId: f.placeId, visited: false,
      });
    })), `${targets.length}곳을 추가했어요`);
    setBusy("");
    if (ok) onClose();
  }

  const progress = Object.keys(found).length;
  const lines = text.split("\n").filter((l) => l.trim()).length;

  if (!entries) {
    return (
      <Sheet title="여러 곳 한 번에 추가" onClose={onClose}
        footer={<button className="btn primary" disabled={lines === 0 || !hasGoogleKey()} onClick={search}>{lines ? `${lines}곳 Google에서 찾기` : "장소 이름을 넣어 주세요"}</button>}>
        <p className="keep" style={{ margin: 0, fontSize: 13, color: "var(--ink2)", lineHeight: 1.5 }}>
          한 줄에 한 곳씩 이름을 적어 주세요. 메모는 <b>|</b> 뒤에 쓰면 같이 저장돼요. 구글맵 저장 목록은 Google 테이크아웃에서 받은 CSV 파일을 올리면 돼요.
        </p>
        <textarea id="import-text" className="input" style={{ minHeight: 160 }} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Cong Caphe Sapa\nMoana Sapa | 그네 사진 명소\nHill Station Signature Restaurant"} />
        <label className="btn ghost" style={{ justifyContent: "center", cursor: "pointer" }}>
          <Upload className="icon" />CSV 파일 올리기
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        </label>
        <div className="field">
          <span>어느 지역 주변에서 찾을까요?</span>
          <div className="chips">{["사파", "하노이"].map((c) => <button key={c} type="button" className="chip" aria-pressed={city === c} onClick={() => setCity(c)}>{c}</button>)}</div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="찾은 장소 확인" onClose={onClose}
      footer={busy === "search"
        ? <button className="btn primary" disabled>찾는 중이에요 ({progress}/{entries.length})</button>
        : <button className="btn primary" disabled={busy !== "" || chosen.size === 0} onClick={save}>선택한 {chosen.size}곳 추가</button>}>
      <p className="keep" style={{ margin: 0, fontSize: 13, color: "var(--ink2)" }}>맞는 것만 체크하세요. 이미 있는 장소는 체크하지 않았어요.</p>
      <div className="list" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
        {entries.map((e) => {
          const f = found[e.key];
          const done = e.key in found;
          const dup = f && (existingIds.has(f.placeId) || existingNames.has(f.name.trim().toLowerCase()));
          return (
            <div key={e.key} className="li with-check">
              <button className="check" style={{ margin: 0 }} role="checkbox" aria-checked={chosen.has(e.key)} disabled={!f} aria-label={`${e.name} 추가`}
                onClick={() => { const s = new Set(chosen); if (s.has(e.key)) s.delete(e.key); else s.add(e.key); setChosen(s); }}>
                <span className="box"><Check className="icon" /></span>
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="li-title">{e.name}{f?.name && f.name !== e.name && <span style={{ fontWeight: 400, color: "var(--ink3)" }}> ({f.name})</span>}</div>
                <div className="li-sub keep">
                  {!done ? "찾는 중" : f ? <>{PLACE_TYPES[kindOf(f.primaryType)].label}, {f.address}{dup && <b style={{ color: "var(--danger)" }}> (이미 있음)</b>}</> : <span style={{ color: "var(--danger)" }}>못 찾았어요</span>}
                </div>
              </div>
              <span />
            </div>
          );
        })}
      </div>
      <div className="suggest-attr" style={{ border: 0 }}>Powered by Google</div>
    </Sheet>
  );
}
