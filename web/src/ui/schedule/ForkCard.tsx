import { useRef, useState } from "react";
import { MemoToggle } from "./MemoToggle";
import { ArrowUpRight, Check, ChevronDown, ChevronUp, CloudFog, Link2, Pencil, Plus, RotateCcw, Split } from "lucide-react";
import type { BranchKey, Item, Member } from "../../domain/types";
import type { ForkEntry } from "../../domain/timeline";
import { estimateLeg, formatKm, formatMinutes, isSameSpot, type LatLng } from "../../domain/geo";
import { describe, MOUNTAIN_FORECAST_URL, type DailyWeather } from "../../infra/weather";
import { WEATHER_ICON } from "../icons";
import { forecastHint } from "./DayHead";
import { formatApproxKrw, type PlannedCost } from "../../domain/money";

interface Props {
  entry: ForkEntry;
  numberStart: number;
  members: readonly Member[];
  meName: string | null;
  otherName: string | null;
  summit: DailyWeather | null;
  dayDate: string;
  branchCosts: ReadonlyMap<BranchKey, PlannedCost>;
  onPick: (key: BranchKey) => void;
  onEdit: () => void;
  onAddItem: (key: BranchKey) => void;
}

const hasLoc = (i: Item): i is Item & LatLng => i.lat !== null && i.lng !== null;

/** Before a choice: the trail splits into the plans; tap or swipe to preview, then confirm. */
export function ForkCard({ entry, numberStart, otherName, summit, dayDate, branchCosts, onPick, onEdit, onAddItem }: Props) {
  const { group, branches } = entry;
  const keys = group.branches.map((b) => b.key);
  const [tab, setTab] = useState<BranchKey>(keys[0] ?? "A");
  const at = Math.max(0, keys.indexOf(tab));
  const branch = group.branches[at];
  const steps = branches.get(tab) ?? [];
  const touch = useRef<{ x: number; y: number } | null>(null);

  let n = numberStart;
  let prev: LatLng | null = null;
  const WxIcon = summit ? WEATHER_ICON[describe(summit.code).icon] : CloudFog;

  return (
    <section
      className="fork"
      aria-label={`갈림길: ${group.title}`}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; e.stopPropagation(); }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) < 50 || Math.abs(dy) > 40) return;
        const i = at + (dx < 0 ? 1 : -1);
        if (i >= 0 && i < keys.length) setTab(keys[i]);
      }}
    >
      <div className="fork-head">
        <h3 className="fork-title">{group.title}</h3>
        {group.decideAt && <div className="fork-when">{group.decideAt}</div>}
        <button className="fork-edit" onClick={onEdit} aria-label="갈림길 고치기"><Pencil className="icon" style={{ width: 16, height: 16 }} /></button>
      </div>
      <div className="fork-wx">
        <WxIcon className="icon" />
        <div className="grow">
          {summit ? (
            <>
              <b>판시판 정상 {summit.tMax}° / {summit.tMin}°</b>
              <span>구름 {summit.cloud}%&ensp;강수 {summit.rainProb}%&ensp;바람 {summit.wind}km/h</span>
            </>
          ) : <span>{forecastHint(dayDate)}</span>}
        </div>
        <a className="mf-link" href={MOUNTAIN_FORECAST_URL} target="_blank" rel="noopener noreferrer">상세<ArrowUpRight className="icon" /></a>
      </div>
      <div className="trail" role="tablist" aria-label="플랜 고르기">
        {group.branches.map((b, i) => (
          <button
            key={b.key}
            role="tab"
            aria-selected={b.key === tab}
            className={`trail-opt ${i < at ? "pass" : ""}`}
            onClick={() => setTab(b.key)}
          >
            <span className="trail-k">{b.key}</span>
            <span className="trail-cond">
              {b.condition || b.label}
              {(branchCosts.get(b.key)?.counted ?? 0) > 0 && <small className="trail-cost num">{formatApproxKrw(branchCosts.get(b.key)!.krw)}</small>}
            </span>
          </button>
        ))}
      </div>
      <div className="plan-list" role="tabpanel">
        {steps.length === 0 && <div className="p-empty">아직 일정이 없어요</div>}
        {steps.map((it) => {
          const leg = prev && hasLoc(it) && !isSameSpot(prev, it) ? estimateLeg(prev, it) : null;
          if (hasLoc(it)) prev = it;
          const num = it.place ? n++ : null;
          return (
            <div key={it.id} style={{ display: "contents" }}>
              {leg && <div className="p-leg">{leg.mode === "walk" ? "도보" : "차"} 약 {formatMinutes(leg.minutes)}, {formatKm(leg.km)}</div>}
              <div className="p-row">
                {num !== null ? <span className="p-mk">{num}</span> : <span className="p-mk dot" />}
                <div style={{ minWidth: 0 }}>
                  <div className="p-title">{it.title}</div>
                  {(it.time || it.place || it.stops.length > 0) && <div className="p-meta">{it.time && <span>{it.time}</span>}{it.place && <span>{it.place}</span>}{it.stops.length > 0 && <span>경유 {it.stops.length}곳</span>}</div>}
                  {it.memo && <MemoToggle memo={it.memo} />}
                </div>
              </div>
            </div>
          );
        })}
        <button className="e-add" style={{ paddingLeft: 0 }} onClick={() => onAddItem(tab)}><Plus className="icon" />플랜 {tab}에 일정 추가</button>
      </div>
      {branch?.note && <div className="ripple-note"><Link2 className="icon" /><span>{branch.note}</span></div>}
      <div className="pick">
        <button className="btn-pick" onClick={() => onPick(tab)}><Check className="icon" />플랜 {tab}로 갈게</button>
        <div className="pick-hint">누르면 {otherName ?? "상대"} 폰에도 바로 반영돼요</div>
      </div>
    </section>
  );
}

/** After a choice: a compact row on the rail, then the chosen plan's items, then the others folded. */
export function ChosenHeader({ entry, members, onReset, just }: { entry: ForkEntry; members: readonly Member[]; onReset: () => void; just: boolean }) {
  const { group } = entry;
  const b = group.branches.find((x) => x.key === group.selected);
  const by = members.find((m) => m.id === group.selectedBy)?.displayName;
  const time = group.selectedAt ? new Date(group.selectedAt).toTimeString().slice(0, 5) : "";
  const particle = by ? (hasBatchim(by) ? "이" : "가") : "";
  return (
    <div className={`tl-row ${just ? "just" : ""}`}>
      <div className="tl-rail">
        <span className="mk letter">{group.selected}</span>
        {time && <span className="tl-time">{time}</span>}
      </div>
      <section className="fork chosen" aria-label={`갈림길: ${group.title}`}>
        <div className="chosen-txt">
          <b>{b?.condition || b?.label}</b>
          <span>{by ? `${by}${particle} 플랜 ${group.selected}로 골랐어요` : `플랜 ${group.selected}`}</span>
        </div>
        <button className="btn-text" onClick={onReset}><RotateCcw className="icon" />다시 고르기</button>
      </section>
    </div>
  );
}

export function OtherPlans({ entry }: { entry: ForkEntry }) {
  const [open, setOpen] = useState(false);
  const rest = entry.group.branches.filter((b) => b.key !== entry.group.selected);
  if (rest.length === 0) return null;
  return (
    <div className="tl-row">
      <div className="tl-rail"><span className="mk dot" style={{ opacity: 0 }} /></div>
      <div className="others">
        <button className="others-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Split className="icon" style={{ width: 15, height: 15 }} />다른 플랜 보기 ({rest.map((b) => b.key).join(", ")})</span>
          {open ? <ChevronUp className="icon" /> : <ChevronDown className="icon" />}
        </button>
        {open && (
          <div className="others-body">
            {rest.map((b) => (
              <div key={b.key}>
                <div className="ob-head"><span className="k">{b.key}</span>{b.condition || b.label}</div>
                <ol>{(entry.branches.get(b.key) ?? []).map((i) => <li key={i.id}>{i.title}</li>)}</ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
