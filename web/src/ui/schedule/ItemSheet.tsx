import { useState } from "react";
import { Route, Trash2 } from "lucide-react";
import { CATEGORY_LABEL, type BranchKey, type Category, type Currency, type Item, type Stop } from "../../domain/types";
import { create, remove, update, useApp } from "../../app/store";
import { attempt } from "../toast";
import { Sheet } from "../Sheet";
import { CATEGORY_ICON } from "../icons";
import { shortDay } from "../format";
import { PlaceSearch } from "../PlaceSearch";
import { StopsEditor } from "./StopsEditor";
import { PhotoPicker } from "../Photos";
import { shrink } from "../../infra/photos";

export interface ItemDraftTarget {
  readonly day: string;
  readonly group: string | null;
  readonly branch: BranchKey | null;
}

const CATS = Object.keys(CATEGORY_LABEL) as Category[];

/** Add or edit one schedule item. Placement is "day + (common | plan of a fork)". */
export function ItemSheet({ item, target, onClose }: { item: Item | null; target: ItemDraftTarget; onClose: () => void }) {
  const { snapshot } = useApp();
  const [title, setTitle] = useState(item?.title ?? "");
  const [cat, setCat] = useState<Category>(item?.cat ?? "sight");
  const [time, setTime] = useState(item?.time ?? "");
  const [place, setPlace] = useState(item?.place ?? "");
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(item?.lat != null && item?.lng != null ? { lat: item.lat, lng: item.lng } : null);
  const [placeId, setPlaceId] = useState(item?.placeId ?? "");
  const [stops, setStops] = useState<Stop[]>(item ? [...item.stops] : []);
  const [removedPhotos, setRemovedPhotos] = useState<Set<string>>(new Set());
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [showStops, setShowStops] = useState((item?.stops.length ?? 0) > 0 || (item?.cat ?? "") === "trek");
  const [memo, setMemo] = useState(item?.memo ?? "");
  const [cost, setCost] = useState(item?.cost ? String(item.cost) : "");
  const [cur, setCur] = useState<Currency>(item?.cur ?? "VND");
  const [link, setLink] = useState(item?.link ?? "");
  const [booking, setBooking] = useState<string>(item?.booking ?? "");
  const [day, setDay] = useState(item?.day ?? target.day);
  const [slot, setSlot] = useState(slotKey(item?.group ?? target.group, item?.branch ?? target.branch));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;

  const days = [...snapshot.days].sort((a, b) => a.n - b.n);
  const forks = snapshot.groups.filter((g) => g.day === day);

  async function save() {
    const [group, branch] = parseSlot(forks.some((g) => slot.startsWith(g.id)) ? slot : "");
    const siblings = snapshot!.items.filter((i) => i.day === day && (i.group ?? "") === (group ?? "") && (i.branch ?? "") === (branch ?? ""));
    const nextOrder = Math.max(0, ...siblings.map((i) => i.order), ...(group ? [] : snapshot!.groups.filter((g) => g.day === day).map((g) => g.order))) + 1;
    const moved = !item || item.day !== day || (item.group ?? "") !== (group ?? "") || (item.branch ?? "") !== (branch ?? "");
    const data = {
      title: title.trim(), cat, time, place: place.trim(), memo, link: link.trim(),
      cost: Number(cost) || 0, cur: cost ? cur : "",
      lat: loc?.lat ?? 0, lng: loc?.lng ?? 0, placeId, stops,
      ...(newPhotos.length ? { "photos+": await Promise.all(newPhotos.map((f) => shrink(f))) } : {}),
      ...(removedPhotos.size ? { "photos-": [...removedPhotos] } : {}),
      booking,
      day, group: group ?? "", branch: branch ?? "",
      ...(moved ? { order: nextOrder } : {}),
    };
    setBusy(true);
    const ok = await attempt(() => (item ? update("items", item.id, data) : create("items", data)), item ? "저장했어요" : "일정을 추가했어요");
    setBusy(false);
    if (ok) onClose();
  }

  async function del() {
    if (!item) return;
    setBusy(true);
    const ok = await attempt(() => remove("items", item.id), "일정을 삭제했어요");
    setBusy(false);
    if (ok) onClose();
  }

  const footer = confirmDelete ? (
    <>
      <button className="btn ghost" onClick={() => setConfirmDelete(false)}>취소</button>
      <button className="btn primary" style={{ background: "var(--danger)" }} disabled={busy} onClick={del}>삭제하기</button>
    </>
  ) : (
    <>
      {item && <button className="btn ghost danger" aria-label="삭제" onClick={() => setConfirmDelete(true)}><Trash2 className="icon" /></button>}
      <button className="btn primary" disabled={!title.trim() || busy} onClick={save}>{item ? "저장" : "추가"}</button>
    </>
  );

  return (
    <Sheet title={item ? "일정 고치기" : "일정 추가"} onClose={onClose} footer={footer}>
      {confirmDelete && <p className="keep" style={{ margin: 0, fontSize: 14 }}>"{item?.title}" 일정을 삭제할까요? 두 폰 모두에서 사라져요.</p>}
      <label className="field">
        <span>제목</span>
        <input id="item-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 아침 쌀국수" autoFocus={!item} />
      </label>
      <div className="field">
        <span>분류</span>
        <div className="chips">
          {CATS.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}><Icon className="icon" />{CATEGORY_LABEL[c]}</button>;
          })}
        </div>
      </div>
      <div className="row2">
        <label className="field">
          <span>날짜</span>
          <select id="item-day" className="input" value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); }}>
            {days.map((d) => <option key={d.id} value={d.id}>{d.n}일차 {shortDay(d.date)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>시간 (선택)</span>
          <input id="item-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {forks.length > 0 && (
        <label className="field">
          <span>넣을 곳</span>
          <select id="item-slot" className="input" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">공통 일정</option>
            {forks.flatMap((g) => g.branches.map((b) => (
              <option key={`${g.id}:${b.key}`} value={`${g.id}:${b.key}`}>{g.title}, 플랜 {b.key}</option>
            )))}
          </select>
        </label>
      )}
      <div className="field">
        <label htmlFor="item-place" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>장소</label>
        <PlaceSearch
          id="item-place"
          value={place}
          city={days.find((d) => d.id === day)?.city ?? ""}
          located={loc !== null}
          onText={(t) => { setPlace(t); setLoc(null); setPlaceId(""); }}
          onPick={(p) => {
            setPlace(p.name);
            setLoc({ lat: p.lat, lng: p.lng });
            setPlaceId(p.placeId);
            if (!title.trim()) setTitle(p.name);
            if (!link.trim() && p.url) setLink(p.url);
          }}
          onClear={() => { setPlace(""); setLoc(null); setPlaceId(""); }}
        />
      </div>
      {showStops || cat === "trek"
        ? <StopsEditor stops={stops} city={days.find((d) => d.id === day)?.city ?? ""} onChange={setStops} />
        : <button type="button" className="btn-text" style={{ alignSelf: "flex-start", paddingLeft: 0, marginTop: -6 }} onClick={() => setShowStops(true)}><Route className="icon" />경유지(코스) 추가</button>}
      <label className="field">
        <span>메모</span>
        <textarea id="item-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </label>
      <PhotoPicker
        itemId={item?.id ?? null}
        existing={item?.photos ?? []}
        removed={removedPhotos}
        added={newPhotos}
        onRemoveExisting={(f) => setRemovedPhotos(new Set([...removedPhotos, f]))}
        onAdd={(fs) => setNewPhotos([...newPhotos, ...fs])}
        onRemoveAdded={(i) => setNewPhotos(newPhotos.filter((_, k) => k !== i))}
      />
      <div className="row2">
        <label className="field">
          <span>비용</span>
          <input id="item-cost" className="input num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        </label>
        <div className="field">
          <span>통화</span>
          <div className="chips">
            {(["VND", "KRW", "USD"] as const).map((c) => <button key={c} type="button" className="chip" aria-pressed={cur === c} onClick={() => setCur(c)}>{c === "VND" ? "₫" : c === "KRW" ? "원" : "$"}</button>)}
          </div>
        </div>
      </div>
      <label className="field">
        <span>링크</span>
        <input id="item-link" className="input" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
      </label>
      {snapshot.bookings.length > 0 && (
        <div className="field">
          <span>연결된 예약</span>
          <div className="chips" role="group" aria-label="연결된 예약">
            <button type="button" className="chip" aria-pressed={booking === ""} onClick={() => setBooking("")}>없음</button>
            {snapshot.bookings.map((b) => (
              <button key={b.id} type="button" className="chip" aria-pressed={booking === b.id} onClick={() => setBooking(b.id)}>{b.title}{b.files.length ? ` · 티켓 ${b.files.length}` : ""}</button>
            ))}
          </div>
          <small className="hint">고르면 일정 카드와 지금 카드에서 티켓을 바로 열 수 있어요.</small>
        </div>
      )}
    </Sheet>
  );
}

const slotKey = (group: string | null, branch: BranchKey | null) => (group ? `${group}:${branch ?? "A"}` : "");
const parseSlot = (s: string): [string | null, BranchKey | null] => {
  if (!s) return [null, null];
  const [g, b] = s.split(":");
  return [g, b as BranchKey];
};
