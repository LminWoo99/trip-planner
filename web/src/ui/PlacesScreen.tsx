import { useState } from "react";
import { Check, CalendarPlus, MapPin, Plus } from "lucide-react";
import type { BranchKey, Place } from "../domain/types";
import { gmapsSearch } from "../domain/geo";
import { create, remove, update, useApp } from "../app/store";
import { PlaceSearch } from "./PlaceSearch";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";
import { shortDay } from "./format";

const TYPE_LABEL: Record<string, string> = { food: "식당", cafe: "카페", sight: "관광", stay: "숙소", shop: "쇼핑", etc: "기타" };
const TYPE_TO_CAT: Record<string, string> = { food: "food", cafe: "cafe", sight: "sight", stay: "stay", shop: "shop" };

export function PlacesScreen() {
  const { snapshot } = useApp();
  const [city, setCity] = useState<string>("전체");
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [scheduling, setScheduling] = useState<Place | null>(null);
  if (!snapshot) return null;

  const cities = ["전체", ...new Set(snapshot.places.map((p) => p.city).filter(Boolean))];
  const list = snapshot.places.filter((p) => city === "전체" || p.city === city);

  return (
    <>
      <div className="screen ground">
        <div className="section">
          <h2>가고 싶은 곳</h2>
          {cities.length > 2 && (
            <div className="chips" style={{ marginBottom: 12 }}>
              {cities.map((c) => <button key={c} className="chip" aria-pressed={city === c} onClick={() => setCity(c)}>{c}</button>)}
            </div>
          )}
          {list.length === 0 ? (
            <div className="empty">아직 장소가 없어요. + 버튼으로 추가해 보세요.</div>
          ) : (
            <div className="list">
              {list.map((p) => (
                <div key={p.id} className={`li with-check ${p.visited ? "is-done" : ""}`}>
                  <button className="check" style={{ margin: 0 }} role="checkbox" aria-checked={p.visited} aria-label={`${p.name} 다녀옴`} onClick={() => void attempt(() => update("places", p.id, { visited: !p.visited }))}>
                    <span className="box"><Check className="icon" /></span>
                  </button>
                  <button style={{ textAlign: "left", minWidth: 0 }} onClick={() => setEditing(p)}>
                    <div className="li-title">{p.name}</div>
                    <div className="li-sub">
                      {[TYPE_LABEL[p.type] ?? p.type, p.city, p.price].filter(Boolean).map((x) => <span key={x}>{x}</span>)}
                    </div>
                    {p.memo && <div className="li-sub keep" style={{ color: "var(--ink2)" }}>{p.memo}</div>}
                  </button>
                  <div style={{ display: "flex" }}>
                    <a className="icon-btn" href={p.link || gmapsSearch({ place: p.q || p.name, placeId: p.placeId })} target="_blank" rel="noopener noreferrer" aria-label="지도에서 보기"><MapPin className="icon" /></a>
                    <button className="icon-btn" aria-label="일정에 추가" onClick={() => setScheduling(p)}><CalendarPlus className="icon" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <button className="fab" aria-label="장소 추가" onClick={() => setEditing("new")}><Plus className="icon" /></button>
      {editing && <PlaceSheet place={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {scheduling && <ScheduleSheet place={scheduling} onClose={() => setScheduling(null)} />}
    </>
  );
}

function PlaceSheet({ place, onClose }: { place: Place | null; onClose: () => void }) {
  const [name, setName] = useState(place?.name ?? "");
  const [city, setCity] = useState(place?.city ?? "사파");
  const [type, setType] = useState(place?.type ?? "food");
  const [q, setQ] = useState(place?.q ?? "");
  const [found, setFound] = useState<{ placeId: string; lat: number; lng: number } | null>(
    place && place.lat !== null && place.lng !== null ? { placeId: place.placeId, lat: place.lat, lng: place.lng } : null,
  );
  const [price, setPrice] = useState(place?.price ?? "");
  const [memo, setMemo] = useState(place?.memo ?? "");
  const [link, setLink] = useState(place?.link ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const data = {
      name: name.trim(), city: city.trim(), type, q: q.trim() || name.trim(), price, memo, link: link.trim(),
      lat: found?.lat ?? 0, lng: found?.lng ?? 0, placeId: found?.placeId ?? "",
    };
    if (await attempt(() => (place ? update("places", place.id, data) : create("places", data)), place ? "저장했어요" : "장소를 추가했어요")) onClose();
  }

  return (
    <Sheet
      title={place ? "장소 고치기" : "장소 추가"}
      onClose={onClose}
      footer={confirmDelete ? (
        <>
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>취소</button>
          <button className="btn primary" style={{ background: "var(--danger)" }} onClick={async () => { if (place && await attempt(() => remove("places", place.id), "삭제했어요")) onClose(); }}>삭제하기</button>
        </>
      ) : (
        <>
          {place && <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>삭제</button>}
          <button className="btn primary" disabled={!name.trim()} onClick={save}>{place ? "저장" : "추가"}</button>
        </>
      )}
    >
      <div className="field">
        <label htmlFor="place-name" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>이름</label>
        <PlaceSearch
          id="place-name"
          value={name}
          city={city}
          located={found !== null}
          placeholder="예: Toàn Mán Restaurant"
          onText={(t) => { setName(t); setFound(null); }}
          onPick={(p) => { setName(p.name); setQ(p.name); setFound({ placeId: p.placeId, lat: p.lat, lng: p.lng }); if (!link.trim() && p.url) setLink(p.url); }}
          onClear={() => { setName(""); setFound(null); }}
        />
      </div>
      <div className="field">
        <span>종류</span>
        <div className="chips">{Object.entries(TYPE_LABEL).map(([k, v]) => <button key={k} type="button" className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{v}</button>)}</div>
      </div>
      <div className="row2">
        <label className="field"><span>지역</span><input id="place-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} /></label>
        <label className="field"><span>가격대</span><input id="place-price" className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="예: 1인 10만동" /></label>
      </div>
      <label className="field"><span>메모</span><textarea id="place-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <label className="field"><span>링크</span><input id="place-link" className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>
    </Sheet>
  );
}

function ScheduleSheet({ place, onClose }: { place: Place; onClose: () => void }) {
  const { snapshot } = useApp();
  const days = [...(snapshot?.days ?? [])].sort((a, b) => a.n - b.n);
  const [day, setDay] = useState(days[0]?.id ?? "");
  const [slot, setSlot] = useState("");
  if (!snapshot) return null;
  const forks = snapshot.groups.filter((g) => g.day === day);

  async function add() {
    const [group, branch] = slot ? (slot.split(":") as [string, BranchKey]) : [null, null];
    const siblings = snapshot!.items.filter((i) => i.day === day && (i.group ?? "") === (group ?? "") && (i.branch ?? "") === (branch ?? ""));
    const order = Math.max(0, ...siblings.map((i) => i.order), ...(group ? [] : forks.map((g) => g.order))) + 1;
    const ok = await attempt(() => create("items", {
      day, order, cat: TYPE_TO_CAT[place.type] ?? "etc", title: place.name, place: place.q || place.name,
      lat: place.lat ?? 0, lng: place.lng ?? 0, placeId: place.placeId, memo: place.memo, link: place.link, group: group ?? "", branch: branch ?? "",
    }), "일정에 추가했어요");
    if (ok) onClose();
  }

  return (
    <Sheet title={`${place.name} 일정에 넣기`} onClose={onClose} footer={<button className="btn primary" onClick={add}>추가</button>}>
      <label className="field">
        <span>날짜</span>
        <select id="sched-day" className="input" value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); }}>
          {days.map((d) => <option key={d.id} value={d.id}>{d.n}일차 {shortDay(d.date)} {d.title}</option>)}
        </select>
      </label>
      {forks.length > 0 && (
        <label className="field">
          <span>넣을 곳</span>
          <select id="sched-slot" className="input" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">공통 일정</option>
            {forks.flatMap((g) => g.branches.map((b) => <option key={`${g.id}:${b.key}`} value={`${g.id}:${b.key}`}>{g.title}, 플랜 {b.key}</option>))}
          </select>
        </label>
      )}
    </Sheet>
  );
}
