import { useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, X } from "lucide-react";
import type { Stop } from "../../domain/types";
import { splitCourse } from "../../domain/geo";
import { findPlace, hasGoogleKey } from "../../infra/google";
import { PlaceSearch } from "../PlaceSearch";

/** Waypoints of one item: add one by search, or paste a whole course ("A → B → C") and look each up. */
export function StopsEditor({ stops, city, onChange }: { stops: readonly Stop[]; city: string; onChange: (s: Stop[]) => void }) {
  const [query, setQuery] = useState("");
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const move = (i: number, d: -1 | 1) => {
    const next = [...stops];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  async function lookUp() {
    const names = splitCourse(text);
    const found: Stop[] = [];
    for (const [i, name] of names.entries()) {
      setProgress(`찾는 중이에요 (${i + 1}/${names.length})`);
      let hit = null;
      try { hit = await findPlace(name, city); } catch { /* keep the name without a position */ }
      found.push(hit ? { name, placeId: hit.placeId, lat: hit.lat, lng: hit.lng } : { name, placeId: "", lat: null, lng: null });
    }
    onChange([...stops, ...found]);
    setProgress(null);
    setPasting(false);
    setText("");
  }

  return (
    <div className="field">
      <span>경유지 (트레킹·투어 코스)</span>
      {stops.length > 0 && (
        <ol className="stops-edit">
          {stops.map((s, i) => (
            <li key={`${s.name}-${i}`}>
              <span className="route-n">{i + 1}</span>
              <span className="keep" style={{ minWidth: 0 }}>{s.name}{s.lat === null && <small style={{ color: "var(--danger)", marginLeft: 6 }}>위치 없음</small>}</span>
              <span style={{ display: "flex" }}>
                <button type="button" className="icon-btn" style={{ width: 36 }} disabled={i === 0} aria-label={`${s.name} 위로`} onClick={() => move(i, -1)}><ArrowUp className="icon" style={{ width: 16 }} /></button>
                <button type="button" className="icon-btn" style={{ width: 36 }} disabled={i === stops.length - 1} aria-label={`${s.name} 아래로`} onClick={() => move(i, 1)}><ArrowDown className="icon" style={{ width: 16 }} /></button>
                <button type="button" className="icon-btn" style={{ width: 36 }} aria-label={`${s.name} 빼기`} onClick={() => onChange(stops.filter((_, k) => k !== i))}><X className="icon" style={{ width: 16 }} /></button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {pasting ? (
        <>
          <textarea id="stops-paste" className="input" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"Sapana Bistro → Sapana 2 → Lao Chai Valley View → 타반 마을\n(화살표나 줄바꿈으로 나눠 주세요)"} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" style={{ height: 44, fontSize: 14 }} onClick={() => { setPasting(false); setText(""); }}>취소</button>
            <button type="button" className="btn primary" style={{ height: 44, fontSize: 14 }} disabled={!splitCourse(text).length || progress !== null || !hasGoogleKey()} onClick={lookUp}>
              {progress ?? `${splitCourse(text).length}곳 찾아서 넣기`}
            </button>
          </div>
        </>
      ) : (
        <>
          <PlaceSearch id="stop-search" value={query} city={city} located={false} placeholder="경유지 검색해서 하나씩 추가"
            onText={setQuery} onClear={() => setQuery("")}
            onPick={(p) => { onChange([...stops, { name: p.name, placeId: p.placeId, lat: p.lat, lng: p.lng }]); setQuery(""); }} />
          <button type="button" className="btn-text" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => setPasting(true)}>
            <ClipboardPaste className="icon" />코스 붙여넣기
          </button>
        </>
      )}
    </div>
  );
}
