import { useMemo, useState } from "react";
import { Bed, CalendarPlus, Camera, Check, Coffee, ExternalLink, ListPlus, Plus, Search, ShoppingBag, Sparkles, Utensils, X, type LucideIcon } from "lucide-react";
import type { BranchKey, Place } from "../domain/types";
import { gmapsSearch } from "../domain/geo";
import { create, remove, update, useApp } from "../app/store";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";
import { shortDay } from "./format";
import { PlaceSearch } from "./PlaceSearch";
import { ImportPlacesSheet } from "./ImportPlacesSheet";

// Each kind gets its own icon and a soft tint so a long list can be scanned without reading.
export const PLACE_TYPES: Record<string, { label: string; icon: LucideIcon; tint: string; ink: string }> = {
  food: { label: "식당", icon: Utensils, tint: "#fdf0e6", ink: "#c2620f" },
  cafe: { label: "카페", icon: Coffee, tint: "#f4eee8", ink: "#8a5a35" },
  sight: { label: "관광", icon: Camera, tint: "#efedfb", ink: "#5b4fe0" },
  stay: { label: "숙소", icon: Bed, tint: "#e8f1fb", ink: "#2f6fbf" },
  shop: { label: "쇼핑", icon: ShoppingBag, tint: "#fbecf2", ink: "#c03a74" },
  etc: { label: "기타", icon: Sparkles, tint: "#eef0f2", ink: "#565d66" },
};
const typeOf = (t: string) => PLACE_TYPES[t] ?? PLACE_TYPES.etc;
const typeKey = (t: string) => (PLACE_TYPES[t] ? t : "etc");
const TYPE_TO_CAT: Record<string, string> = { food: "food", cafe: "cafe", sight: "sight", stay: "stay", shop: "shop" };

export function TypeTile({ type, visited = false, size = 40 }: { type: string; visited?: boolean; size?: number }) {
  const t = typeOf(type);
  const Icon = t.icon;
  return (
    <span className="type-tile" style={{ background: t.tint, color: t.ink, width: size, height: size }} aria-hidden="true">
      <Icon className="icon" style={{ width: size * 0.48, height: size * 0.48 }} />
      {visited && <span className="type-badge"><Check className="icon" /></span>}
    </span>
  );
}

export function PlacesScreen() {
  const { snapshot } = useApp();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [city, setCity] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [scheduling, setScheduling] = useState<Place | null>(null);
  const [importing, setImporting] = useState(false);

  const places = useMemo(() => snapshot?.places ?? [], [snapshot?.places]);
  const cities = useMemo(() => [...new Set(places.map((p) => p.city).filter(Boolean))], [places]);
  if (!snapshot) return null;

  const q = query.trim().toLowerCase();
  const matchesText = (p: Place) => !q || [p.name, p.memo, p.city, typeOf(p.type).label].some((s) => s.toLowerCase().includes(q));
  const base = places.filter((p) => matchesText(p) && (city === "all" || p.city === city));
  const list = base
    .filter((p) => type === "all" || typeKey(p.type) === type)
    .sort((a, b) => Number(a.visited) - Number(b.visited) || a.name.localeCompare(b.name, "ko"));
  const countOf = (t: string) => base.filter((p) => typeKey(p.type) === t).length;
  const open = openId ? places.find((p) => p.id === openId) ?? null : null;

  return (
    <>
      <div className="screen ground">
        <div className="section" style={{ paddingBottom: 8 }}>
          <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            가고 싶은 곳 <span className="num" style={{ fontSize: 14, color: "var(--ink3)", fontWeight: 500 }}>{places.filter((p) => !p.visited).length}곳 남음</span>
          </h2>
          <div className="search-box">
            <Search className="icon" />
            <input id="place-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 메모, 지역으로 찾기" aria-label="장소 검색" autoComplete="off" />
            {query && <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="검색어 지우기" onClick={() => setQuery("")}><X className="icon" style={{ width: 16, height: 16 }} /></button>}
          </div>
          <div className="chips scroll-x" style={{ marginTop: 10 }}>
            <button className="chip" aria-pressed={type === "all"} onClick={() => setType("all")}>전체 {base.length}</button>
            {Object.entries(PLACE_TYPES).map(([k, v]) => countOf(k) > 0 && (
              <button key={k} className="chip" aria-pressed={type === k} onClick={() => setType(type === k ? "all" : k)}>{v.label} {countOf(k)}</button>
            ))}
          </div>
          {cities.length > 1 && (
            <div className="chips scroll-x" style={{ marginTop: 8 }}>
              <button className="chip" aria-pressed={city === "all"} onClick={() => setCity("all")}>모든 지역</button>
              {cities.map((c) => <button key={c} className="chip" aria-pressed={city === c} onClick={() => setCity(city === c ? "all" : c)}>{c}</button>)}
            </div>
          )}
        </div>
        <div className="section" style={{ paddingTop: 4 }}>
          {places.length === 0 ? (
            <div className="empty">아직 장소가 없어요. + 버튼으로 추가하거나, 아래에서 여러 곳을 한 번에 가져오세요.</div>
          ) : list.length === 0 ? (
            <div className="empty">{q ? `"${query}"에 맞는 장소가 없어요` : "이 조건에 맞는 장소가 없어요"}</div>
          ) : (
            <div className="list">
              {list.map((p) => (
                <div key={p.id} className={`li place-row ${p.visited ? "is-visited" : ""}`}>
                  <button className="place-main" onClick={() => setOpenId(p.id)}>
                    <TypeTile type={p.type} visited={p.visited} />
                    <span style={{ minWidth: 0 }}>
                      <span className="li-title" style={{ display: "block" }}>{p.name}</span>
                      <span className="li-sub" style={{ display: "block" }}>{[typeOf(p.type).label, p.city, p.price].filter(Boolean).map((x) => <span key={x}>{x}</span>)}</span>
                      {p.memo && <span className="li-sub keep place-memo">{p.memo}</span>}
                    </span>
                  </button>
                  <button className="icon-btn" aria-label={`${p.name} 일정에 추가`} onClick={() => setScheduling(p)}><CalendarPlus className="icon" /></button>
                </div>
              ))}
            </div>
          )}
          <button className="e-add" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setImporting(true)}><ListPlus className="icon" />여러 곳 한 번에 추가</button>
        </div>
      </div>
      <button className="fab" aria-label="장소 추가" onClick={() => setEditing("new")}><Plus className="icon" /></button>
      {open && (
        <PlaceDetailSheet place={open} onClose={() => setOpenId(null)}
          onEdit={(p) => { setOpenId(null); setEditing(p); }} onSchedule={(p) => { setOpenId(null); setScheduling(p); }} />
      )}
      {editing && <PlaceSheet place={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {scheduling && <ScheduleSheet place={scheduling} onClose={() => setScheduling(null)} />}
      {importing && <ImportPlacesSheet onClose={() => setImporting(false)} />}
    </>
  );
}

function PlaceDetailSheet({ place, onClose, onEdit, onSchedule }: { place: Place; onClose: () => void; onEdit: (p: Place) => void; onSchedule: (p: Place) => void }) {
  const t = typeOf(place.type);
  return (
    <Sheet title={place.name} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={() => onEdit(place)}>고치기</button>
      <button className="btn primary" onClick={() => onSchedule(place)}><CalendarPlus className="icon" />일정에 추가</button>
    </>}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <TypeTile type={place.type} visited={place.visited} size={48} />
        <div className="li-sub" style={{ marginTop: 0, fontSize: 14 }}>{[t.label, place.city, place.price].filter(Boolean).map((x) => <span key={x}>{x}</span>)}</div>
      </div>
      {place.memo && <p className="keep" style={{ margin: 0, fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-line" }}>{place.memo}</p>}
      <div className="list" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
        <a className="li" style={{ textDecoration: "none" }} href={place.link || gmapsSearch({ place: place.q || place.name, placeId: place.placeId })} target="_blank" rel="noopener noreferrer">
          <div className="li-title">구글맵에서 보기</div><ExternalLink className="icon" style={{ marginRight: 10, color: "var(--ink3)" }} />
        </a>
        <button className="li" role="checkbox" aria-checked={place.visited}
          onClick={() => void attempt(() => update("places", place.id, { visited: !place.visited }), place.visited ? "다녀옴 표시를 뺐어요" : "다녀온 곳으로 표시했어요")}>
          <div className="li-title">다녀왔어요</div>
          <span className={`check-mark ${place.visited ? "on" : ""}`}><Check className="icon" /></span>
        </button>
      </div>
    </Sheet>
  );
}

function PlaceSheet({ place, onClose }: { place: Place | null; onClose: () => void }) {
  const [name, setName] = useState(place?.name ?? "");
  const [city, setCity] = useState(place?.city ?? "사파");
  const [type, setType] = useState(place ? typeKey(place.type) : "food");
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
        <div className="chips">{Object.entries(PLACE_TYPES).map(([k, v]) => {
          const Icon = v.icon;
          return <button key={k} type="button" className="chip" aria-pressed={type === k} onClick={() => setType(k)}><Icon className="icon" />{v.label}</button>;
        })}</div>
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
