import { useEffect, useRef, useState } from "react";
import { BedDouble, Bus, Copy, ExternalLink, LogOut, Map as MapIcon, Plane, Plus, Ticket } from "lucide-react";
import type { Booking } from "../domain/types";
import { create, remove, signOut, update, updateTrip, useApp } from "../app/store";
import { attempt, toast } from "./toast";
import { Sheet } from "./Sheet";

const BOOKING_ICON = { flight: Plane, stay: BedDouble, move: Bus, tour: MapIcon, etc: Ticket } as const;
const BOOKING_LABEL = { flight: "항공", stay: "숙소", move: "버스·이동", tour: "투어", etc: "기타" } as const;
const EMERGENCY = [
  { label: "경찰", number: "113" },
  { label: "화재", number: "114" },
  { label: "구급", number: "115" },
  { label: "외교부 영사콜센터", number: "+82-2-3210-0404" },
];

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("복사하지 못했어요. 길게 눌러 직접 복사해 주세요.");
  }
}

export function MoreScreen() {
  const { snapshot } = useApp();
  const [editing, setEditing] = useState<Booking | "new" | null>(null);
  const [settings, setSettings] = useState(false);
  if (!snapshot) return null;

  return (
    <>
      <div className="screen ground">
        <div className="section">
          <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            예약
            <button className="btn-text" onClick={() => setEditing("new")}><Plus className="icon" />추가</button>
          </h2>
          <div className="list">
            {sortBookings(snapshot.bookings).map((b) => {
              const Icon = BOOKING_ICON[b.type] ?? Ticket;
              return (
                <div key={b.id} className="li" style={{ gridTemplateColumns: "28px minmax(0,1fr) auto", alignItems: "start" }}>
                  <Icon className="icon" style={{ marginTop: 2, color: "var(--ink3)" }} />
                  <button style={{ textAlign: "left", minWidth: 0 }} onClick={() => setEditing(b)}>
                    <div className="li-title">{b.title}</div>
                    <div className="li-sub">{b.when ? <span className="num">{b.when}</span> : <span style={{ color: "var(--danger)" }}>일시 미정</span>}</div>
                    {b.memo && <div className="li-sub keep" style={{ color: "var(--ink2)" }}>{b.memo}</div>}
                    {b.code && <div className="li-sub num" style={{ color: "var(--ink)", fontWeight: 600 }}>예약번호 {b.code}</div>}
                  </button>
                  <div style={{ display: "flex" }}>
                    {b.code && <button className="icon-btn" aria-label="예약번호 복사" onClick={() => copy(b.code, "예약번호를 복사했어요")}><Copy className="icon" /></button>}
                    {b.link && <a className="icon-btn" href={b.link} target="_blank" rel="noopener noreferrer" aria-label="예약 링크 열기"><ExternalLink className="icon" /></a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <NotesSection />

        <div className="section">
          <h2>긴급 연락처</h2>
          <div className="list">
            {EMERGENCY.map((c) => (
              <div key={c.number} className="li">
                <div>
                  <div className="li-title">{c.label}</div>
                  <a className="li-sub num" href={`tel:${c.number.replace(/-/g, "")}`} style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600, textDecoration: "none" }}>{c.number}</a>
                </div>
                <button className="icon-btn" aria-label={`${c.label} 번호 복사`} onClick={() => copy(c.number, "번호를 복사했어요")}><Copy className="icon" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="list">
            <button className="li" onClick={() => setSettings(true)}><div className="li-title">환율·예산 설정</div><div className="li-sub num" style={{ paddingRight: 8 }}>1₫={snapshot.trip.vndKrw}원, $1={snapshot.trip.usdKrw.toLocaleString()}원</div></button>
            <button className="li" onClick={signOut}><div className="li-title" style={{ display: "flex", gap: 6, alignItems: "center" }}><LogOut className="icon" />이 폰에서 나가기</div></button>
          </div>
        </div>
      </div>
      {editing && <BookingSheet booking={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  );
}

/** One shared memo. Saves while typing; picks up the other phone's edits when not focused. */
function NotesSection() {
  const { snapshot } = useApp();
  const note = snapshot?.notes[0];
  const [text, setText] = useState(note?.text ?? "");
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { if (!focused) setText(note?.text ?? ""); }, [note?.text, focused]);

  const save = (value: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void attempt(() => (note ? update("notes", note.id, { text: value }) : create("notes", { text: value })));
    }, 700);
  };

  return (
    <div className="section">
      <h2>공유 메모</h2>
      <textarea
        id="shared-note"
        className="input"
        style={{ minHeight: 140, background: "var(--bg)", border: 0, boxShadow: "0 1px 2px rgba(22,25,29,.05)" }}
        value={text}
        placeholder="둘이 같이 보는 메모예요"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); save(e.target.value); }}
      />
    </div>
  );
}

function BookingSheet({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const [type, setType] = useState<Booking["type"]>(booking?.type ?? "flight");
  const [title, setTitle] = useState(booking?.title ?? "");
  const [when, setWhen] = useState(booking?.when ?? "");
  const [code, setCode] = useState(booking?.code ?? "");
  const [memo, setMemo] = useState(booking?.memo ?? "");
  const [link, setLink] = useState(booking?.link ?? "");

  async function save() {
    const data = { type, title: title.trim(), when, code: code.trim(), memo, link: link.trim() };
    if (await attempt(() => (booking ? update("bookings", booking.id, data) : create("bookings", data)), "저장했어요")) onClose();
  }

  return (
    <Sheet title={booking ? "예약 고치기" : "예약 추가"} onClose={onClose} footer={<>
      {booking && <button className="btn ghost danger" onClick={async () => { if (await attempt(() => remove("bookings", booking.id), "삭제했어요")) onClose(); }}>삭제</button>}
      <button className="btn primary" disabled={!title.trim()} onClick={save}>저장</button>
    </>}>
      <div className="field"><span>종류</span><div className="chips">{(Object.keys(BOOKING_LABEL) as Booking["type"][]).map((t) => <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>{BOOKING_LABEL[t]}</button>)}</div></div>
      <label className="field"><span>이름</span><input id="bk-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 하노이 → 인천 VJ960" /></label>
      <label className="field"><span>일시</span><input id="bk-when" className="input" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="예: 12/6 23:40" /></label>
      <label className="field"><span>예약번호</span><input id="bk-code" className="input num" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" /></label>
      <label className="field"><span>메모</span><textarea id="bk-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <label className="field"><span>링크</span><input id="bk-link" className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>
    </Sheet>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const [vnd, setVnd] = useState(String(snapshot?.trip.vndKrw ?? 0.053));
  const [usd, setUsd] = useState(String(snapshot?.trip.usdKrw ?? 1395));
  const [budget, setBudget] = useState(String(snapshot?.trip.budget || ""));
  const valid = Number(vnd) > 0 && Number(usd) > 0;

  async function save() {
    if (await attempt(() => updateTrip({ vndKrw: Number(vnd), usdKrw: Number(usd), budget: Number(budget) || 0 }), "저장했어요")) onClose();
  }

  return (
    <Sheet title="환율·예산 설정" onClose={onClose} footer={<button className="btn primary" disabled={!valid} onClick={save}>저장</button>}>
      <label className="field"><span>1동은 몇 원?</span><input id="set-vnd" className="input num" inputMode="decimal" value={vnd} onChange={(e) => setVnd(e.target.value)} /></label>
      <label className="field"><span>1달러는 몇 원?</span><input id="set-usd" className="input num" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} /></label>
      <label className="field"><span>예산 (원, 선택)</span><input id="set-budget" className="input num" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} /></label>
    </Sheet>
  );
}

/** Chronological by the free-text "when" ("12/3 00:30", "12/6 밤"); undated ones last. */
function sortBookings(list: readonly Booking[]): Booking[] {
  const key = (b: Booking) => {
    const m = /(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(b.when);
    if (!m) return Number.MAX_SAFE_INTEGER;
    return Number(m[1]) * 1e6 + Number(m[2]) * 1e4 + (m[3] ? Number(m[3]) * 100 + Number(m[4]) : 9999);
  };
  return [...list].sort((a, b) => key(a) - key(b));
}
