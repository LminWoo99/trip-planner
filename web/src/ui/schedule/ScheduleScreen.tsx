import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, CalendarArrowUp, Check, Copy, Plus, Split, Trash2 } from "lucide-react";
import type { BranchKey, Group, Item } from "../../domain/types";
import { buildDay, effectiveBranch, effectiveItems } from "../../domain/timeline";
import { isSameSpot, type LatLng } from "../../domain/geo";
import { plannedCost, spentOnDay } from "../../domain/money";
import { remove, update, useApp } from "../../app/store";
import { weatherFor } from "../../infra/weather";
import { attempt } from "../toast";
import { Sheet } from "../Sheet";
import { shortDay, todayIso } from "../format";
import { useForecast } from "../useForecast";
import { DayHead } from "./DayHead";

import { GapRow, ItemRow } from "./ItemCard";
import { ChosenHeader, ForkCard, OtherPlans } from "./ForkCard";
import type { ItemDraftTarget } from "./ItemSheet";

// map (Leaflet), drag (dnd-kit) and forms load when first needed
const DayMap = lazy(() => import("./DayMap").then((m) => ({ default: m.DayMap })));
const NoMap = ({ unlocated }: { unlocated: number }) => (
  <div className="map-none">
    {unlocated > 0 ? `장소 ${unlocated}곳의 위치를 찾으면 동선이 지도에 나와요` : "장소가 있는 일정을 추가하면 동선이 지도에 나와요"}
  </div>
);
const EditList = lazy(() => import("./EditList").then((m) => ({ default: m.EditList })));
const ItemSheet = lazy(() => import("./ItemSheet").then((m) => ({ default: m.ItemSheet })));
const GroupSheet = lazy(() => import("./GroupSheet").then((m) => ({ default: m.GroupSheet })));
const RouteSheet = lazy(() => import("./RouteSheet").then((m) => ({ default: m.RouteSheet })));
const MoveCopySheet = lazy(() => import("./MoveCopySheet").then((m) => ({ default: m.MoveCopySheet })));
const ItemDetailSheet = lazy(() => import("./ItemDetailSheet").then((m) => ({ default: m.ItemDetailSheet })));
const DaySheet = lazy(() => import("./DaySheet").then((m) => ({ default: m.DaySheet })));

const located = (i: Item): LatLng | null => (i.lat !== null && i.lng !== null ? { lat: i.lat, lng: i.lng } : null);
const DAY_KEY = "schedule-day";

export function ScheduleScreen({ onSelectionBar }: { onSelectionBar: (shown: boolean) => void }) {
  const { snapshot, meId } = useApp();
  const forecast = useForecast();
  const days = useMemo(() => [...(snapshot?.days ?? [])].sort((a, b) => a.n - b.n), [snapshot?.days]);
  const [dayIdx, setDayIdx] = useState(() => initialDay(days));
  const [edit, setEdit] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemSheet, setItemSheet] = useState<{ item: Item | null; target: ItemDraftTarget } | null>(null);
  const [groupSheet, setGroupSheet] = useState<{ group: Group | null } | null>(null);
  const [bulk, setBulk] = useState<"move" | "copy" | "delete" | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState(false);
  const [preview, setPreview] = useState<Map<string, BranchKey>>(new Map());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [justPicked, setJustPicked] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const day = days[Math.min(dayIdx, days.length - 1)];
  useEffect(() => { onSelectionBar(edit && selected.size > 0); }, [edit, selected, onSelectionBar]);
  useEffect(() => () => onSelectionBar(false), [onSelectionBar]);

  const entries = useMemo(() => (snapshot && day ? buildDay(day.id, snapshot.items, snapshot.groups) : []), [snapshot, day]);
  const effective = useMemo(() => effectiveItems(entries, preview), [entries, preview]);
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    let n = 1;
    for (const it of effective) if (it.place) m.set(it.id, n++);
    return m;
  }, [effective]);

  if (!snapshot || !day) return <div className="screen"><div className="empty">일정이 없어요</div></div>;

  const members = snapshot.members;
  const rates = { vndKrw: snapshot.trip.vndKrw, usdKrw: snapshot.trip.usdKrw };
  const planned = plannedCost(effective, rates);
  const spent = spentOnDay(snapshot.expenses, day.id, rates);
  const me = members.find((m) => m.id === meId);
  const other = members.find((m) => m.id !== meId);
  const terrain = effective.some((i) => i.cat === "trek");
  const firstFork = entries.find((e) => e.kind === "fork");
  const basisLabel = firstFork && firstFork.kind === "fork"
    ? (firstFork.group.selected
      ? `플랜 ${firstFork.group.selected}`
      : preview.has(firstFork.group.id) ? `플랜 ${effectiveBranch(firstFork.group, preview)} 미리보기` : `선택 전, 플랜 ${effectiveBranch(firstFork.group)}`)
    : null;
  const mapNote = basisLabel ? `${basisLabel} 동선`
    : `${day.n}일차 동선`;

  const goDay = (i: number) => {
    const next = Math.max(0, Math.min(days.length - 1, i));
    setDayIdx(next);
    setSelected(new Set());
    try { sessionStorage.setItem(DAY_KEY, String(next)); } catch { /* ignore */ }
    scroller.current?.scrollTo({ top: 0 });
  };

  const toggleDone = (it: Item) => void attempt(() => update("items", it.id, { done: !it.done }));
  const pick = (g: Group, key: BranchKey) => {
    setJustPicked(g.id);
    setTimeout(() => setJustPicked(null), 900);
    void attempt(() => update("groups", g.id, { selected: key, selectedBy: meId ?? "", selectedAt: new Date().toISOString() }), `플랜 ${key}로 정했어요`);
  };
  const resetPick = (g: Group) => void attempt(() => update("groups", g.id, { selected: "", selectedBy: "", selectedAt: "" }));
  const openNew = (group: string | null = null, branch: BranchKey | null = null) => setItemSheet({ item: null, target: { day: day.id, group, branch } });

  // ---- timeline rows ----
  const rows: React.ReactNode[] = [];
  let n = 1;
  let prev: LatLng | null = null;
  const pushItem = (it: Item, className = "") => {
    const loc = located(it);
    if (prev && loc && !isSameSpot(prev, loc)) rows.push(<GapRow key={`gap-${it.id}`} from={prev} to={loc} />);
    if (loc) prev = loc;
    const num = it.place ? n++ : null;
    rows.push(<ItemRow key={it.id} item={it} n={num} className={className} onOpen={() => setItemSheet({ item: it, target: { day: day.id, group: it.group, branch: it.branch } })} onToggle={() => toggleDone(it)} onRoute={() => setRouteId(it.id)} />);
  };
  for (const e of entries) {
    if (e.kind === "item") { pushItem(e.item); continue; }
    const g = e.group;
    if (!g.selected) {
      const shown = effectiveBranch(g, preview) ?? "A";
      const basis = e.branches.get(shown) ?? [];
      rows.push(
        <div className="tl-row" key={g.id}>
          <div className="tl-rail"><span className="mk"><Split className="icon" /></span><span className="tl-time">결정</span></div>
          <ForkCard
            entry={e}
            numberStart={n}
            members={members}
            meName={me?.displayName ?? null}
            otherName={other?.displayName ?? null}
            summit={weatherFor(forecast, "fansipan", day.date)}
            dayDate={day.date}
            branchCosts={new Map(g.branches.map((b) => [b.key, plannedCost(e.branches.get(b.key) ?? [], rates)]))}
            tab={shown}
            onTab={(k) => setPreview(new Map(preview).set(g.id, k))}
            onOpenItem={(it) => setDetailId(it.id)}
            onPick={(k) => pick(g, k)}
            onEdit={() => setGroupSheet({ group: g })}
            onAddItem={(k) => openNew(g.id, k)}
          />
        </div>,
      );
      // numbering and distances after the fork follow plan A, same as the map
      for (const it of basis) { if (it.place) n++; const loc = located(it); if (loc) prev = loc; }
    } else {
      const just = justPicked === g.id;
      rows.push(<ChosenHeader key={g.id} entry={e} members={members} just={just} onReset={() => resetPick(g)} />);
      for (const it of e.branches.get(g.selected) ?? []) pushItem(it, just ? "just-row" : "");
      rows.push(<OtherPlans key={`${g.id}-others`} entry={e} />);
    }
  }

  return (
    <>
      <div className="days" role="toolbar" aria-label="날짜">
        {days.map((d, i) => (
          <button key={d.id} className="pill" aria-pressed={i === dayIdx} onClick={() => goDay(i)} aria-label={`${d.n}일차 ${shortDay(d.date)}`}>Day {d.n}</button>
        ))}
        <button className={`pill ${edit ? "outline" : ""}`} onClick={() => { setEdit(!edit); setSelected(new Set()); }}>
          {edit ? <><Check className="icon" />완료</> : <><ArrowUpDown className="icon" />편집</>}
        </button>
      </div>
      <div
        ref={scroller}
        className="screen ground"
        onTouchStart={(e) => { touch.current = edit ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t || (e.target as HTMLElement).closest(".map")) return;
          const dx = e.changedTouches[0].clientX - t.x;
          const dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 70 && Math.abs(dy) < 40) goDay(dayIdx + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="day-top">
          {!edit && <DayHead day={day} forecast={forecast} planned={planned} spent={spent} onEdit={() => setEditingDay(true)} basis={basisLabel} />}
          {edit && <div className="day-head"><h2>{day.n}일차 <span style={{ color: "var(--ink3)", fontWeight: 500, fontSize: 15 }}>{shortDay(day.date)}</span></h2></div>}
          {effective.some((i) => i.lat !== null && i.lng !== null)
            ? <Suspense fallback={<div className="map" />}><DayMap stops={effective.filter((i) => numbers.has(i.id)).map((item) => ({ n: numbers.get(item.id)!, item }))} note={mapNote} terrain={terrain} /></Suspense>
            : <NoMap unlocated={effective.filter((i) => i.place).length} />}
        </div>
        {edit ? (
          <Suspense fallback={null}><EditList
            entries={entries}
            numbers={numbers}
            selected={selected}
            onToggleSelect={(id) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); }}
            onOpenItem={(it) => setItemSheet({ item: it, target: { day: day.id, group: it.group, branch: it.branch } })}
            onAddItem={(g, b) => openNew(g, b)}
            onAddGroup={() => setGroupSheet({ group: null })}
            onEditGroup={(id) => setGroupSheet({ group: snapshot.groups.find((g) => g.id === id) ?? null })}
          /></Suspense>
        ) : rows.length > 0 ? (
          <div className="tl">{rows}</div>
        ) : (
          <div className="empty">아직 일정이 없어요.<br />오른쪽 아래 + 버튼으로 추가해 보세요.</div>
        )}
      </div>

      {!edit && <button className="fab" aria-label="일정 추가" onClick={() => openNew()}><Plus className="icon" /></button>}
      {edit && selected.size > 0 && (
        <div className="selbar">
          <b>{selected.size}개 선택</b>
          <button onClick={() => setBulk("move")}><CalendarArrowUp className="icon" />옮기기</button>
          <button onClick={() => setBulk("copy")}><Copy className="icon" />복사</button>
          <button className="danger" onClick={() => setBulk("delete")}><Trash2 className="icon" />삭제</button>
        </div>
      )}

      <Suspense fallback={null}>
        {itemSheet && <ItemSheet item={itemSheet.item} target={itemSheet.target} onClose={() => setItemSheet(null)} />}
        {groupSheet && <GroupSheet group={groupSheet.group} day={day.id} onClose={() => setGroupSheet(null)} />}
        {editingDay && <DaySheet day={day} onClose={() => setEditingDay(false)} />}
        {detailId && !itemSheet && !routeId && (() => {
          const it = snapshot.items.find((x) => x.id === detailId);
          return it ? <ItemDetailSheet item={it} onClose={() => setDetailId(null)}
            onEdit={() => { setDetailId(null); setItemSheet({ item: it, target: { day: it.day, group: it.group, branch: it.branch } }); }}
            onRoute={() => { setDetailId(null); setRouteId(it.id); }} /> : null;
        })()}
        {routeId && !itemSheet && (() => {
          const it = snapshot.items.find((x) => x.id === routeId);
          return it ? <RouteSheet item={it} onClose={() => setRouteId(null)} onEdit={() => { setRouteId(null); setItemSheet({ item: it, target: { day: it.day, group: it.group, branch: it.branch } }); }} /> : null;
        })()}
      </Suspense>
      {(bulk === "move" || bulk === "copy") && (
        <Suspense fallback={null}><MoveCopySheet mode={bulk} ids={selected} currentDay={day.id} onClose={() => setBulk(null)} onDone={() => { setBulk(null); setSelected(new Set()); }} /></Suspense>
      )}
      {bulk === "delete" && (
        <Sheet
          title={`${selected.size}개를 삭제할까요?`}
          onClose={() => setBulk(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setBulk(null)}>취소</button>
            <button className="btn primary" style={{ background: "var(--danger)" }} onClick={async () => {
              const ids = [...selected];
              const ok = await attempt(() => Promise.all(ids.map((id) => remove("items", id))), "삭제했어요");
              if (ok) { setBulk(null); setSelected(new Set()); }
            }}>삭제하기</button>
          </>}
        >
          <p className="keep" style={{ margin: 0, fontSize: 14 }}>두 폰 모두에서 사라져요.</p>
        </Sheet>
      )}
    </>
  );
}

function initialDay(days: readonly { date: string }[]): number {
  const today = days.findIndex((d) => d.date === todayIso());
  if (today >= 0) return today;
  try {
    const saved = Number(sessionStorage.getItem(DAY_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < days.length) return saved;
  } catch { /* ignore */ }
  return 0;
}
