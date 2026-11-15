import { useState } from "react";
import { ChevronRight, Split } from "lucide-react";
import type { BranchKey, Day } from "../../domain/types";
import { create, update, useApp } from "../../app/store";
import { attempt } from "../toast";
import { Sheet } from "../Sheet";
import { shortDay } from "../format";

interface Target {
  readonly day: Day;
  readonly group: string | null;
  readonly branch: BranchKey | null;
  readonly label: string;
}

/** Move or copy selected items to another place: a day, then (if that day has forks) common or a plan. */
export function MoveCopySheet({ mode, ids, currentDay, onDone, onClose }: {
  mode: "move" | "copy";
  ids: ReadonlySet<string>;
  currentDay: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const { snapshot } = useApp();
  const [day, setDay] = useState<Day | null>(null);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const verb = mode === "move" ? "옮길까요" : "복사할까요";
  const days = [...snapshot.days].sort((a, b) => a.n - b.n);
  const picked = snapshot.items.filter((i) => ids.has(i.id)).sort((a, b) => a.order - b.order);

  async function run(t: Target) {
    // append after whatever is already in that slot
    const siblings = snapshot!.items.filter((i) => i.day === t.day.id && (i.group ?? null) === t.group && (t.group === null || i.branch === t.branch));
    const groupOrders = t.group ? [] : snapshot!.groups.filter((g) => g.day === t.day.id).map((g) => g.order);
    const base = Math.max(0, ...siblings.filter((i) => !ids.has(i.id)).map((i) => i.order), ...groupOrders);
    const slot = { day: t.day.id, group: t.group ?? "", branch: t.branch ?? "" };
    setBusy(true);
    const ok = mode === "move"
      ? await attempt(() => Promise.all(picked.map((it, k) => update("items", it.id, { ...slot, order: base + k + 1 }))), `${t.label}(으)로 옮겼어요`)
      : await attempt(() => Promise.all(picked.map((it, k) => create("items", {
          ...slot, order: base + k + 1, done: false,
          time: it.time, cat: it.cat, title: it.title, place: it.place, placeId: it.placeId,
          lat: it.lat ?? 0, lng: it.lng ?? 0, memo: it.memo, cost: it.cost, cur: it.cur ?? "", link: it.link, stops: it.stops,
        }))), `${t.label}에 복사했어요`);
    setBusy(false);
    if (ok) onDone();
  }

  function pickDay(d: Day) {
    const forks = snapshot!.groups.filter((g) => g.day === d.id);
    if (forks.length === 0) void run({ day: d, group: null, branch: null, label: `${d.n}일차` });
    else setDay(d);
  }

  if (day) {
    const forks = snapshot.groups.filter((g) => g.day === day.id).sort((a, b) => a.order - b.order);
    return (
      <Sheet title={`${day.n}일차 어디에 ${verb}?`} onClose={onClose} footer={<button className="btn ghost" style={{ flex: 1 }} onClick={() => setDay(null)}>날짜 다시 고르기</button>}>
        <div className="list" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
          <button className="li" disabled={busy} onClick={() => run({ day, group: null, branch: null, label: `${day.n}일차 공통 일정` })}>
            <div className="li-title">공통 일정</div><ChevronRight className="icon" style={{ color: "var(--ink3)", marginRight: 8 }} />
          </button>
          {forks.flatMap((g) => g.branches.map((b) => (
            <button key={`${g.id}:${b.key}`} className="li" disabled={busy} onClick={() => run({ day, group: g.id, branch: b.key, label: `플랜 ${b.key}` })}>
              <div style={{ minWidth: 0 }}>
                <div className="li-title" style={{ display: "flex", gap: 6, alignItems: "center" }}><Split className="icon" style={{ width: 15, height: 15, color: "var(--ink3)" }} />플랜 {b.key}</div>
                <div className="li-sub keep">{g.title}{b.condition ? `, ${b.condition}` : ""}</div>
              </div>
              <ChevronRight className="icon" style={{ color: "var(--ink3)", marginRight: 8 }} />
            </button>
          )))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`${ids.size}개를 어느 날로 ${verb}?`} onClose={onClose}>
      {mode === "copy" && <p className="keep" style={{ margin: 0, fontSize: 13, color: "var(--ink2)" }}>원래 자리에는 그대로 두고, 고른 곳 맨 뒤에 같은 일정을 하나씩 더 만들어요. 사진과 완료 표시는 복사하지 않아요.</p>}
      <div className="list">
        {days.map((d) => {
          const hasFork = snapshot.groups.some((g) => g.day === d.id);
          return (
            <button key={d.id} className="li" disabled={busy} onClick={() => pickDay(d)}>
              <div>
                <div className="li-title">{d.n}일차 {d.title}{d.id === currentDay && <span style={{ fontWeight: 400, color: "var(--ink3)" }}> (지금 날)</span>}</div>
                <div className="li-sub"><span>{shortDay(d.date)}</span>{hasFork && <span>갈림길 있음</span>}</div>
              </div>
              {hasFork && <ChevronRight className="icon" style={{ color: "var(--ink3)", marginRight: 8 }} />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
