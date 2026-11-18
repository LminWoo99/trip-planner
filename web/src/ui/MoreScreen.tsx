import { todaysKrwRates } from "../infra/rates";
import { formatMoney, moneyOf } from "../domain/countries";
import { useEffect, useRef, useState } from "react";
import { BedDouble, Bus, CircleCheck, Copy, ExternalLink, LogOut, Map as MapIcon, Plane, Plus, Ticket } from "lucide-react";
import type { Booking } from "../domain/types";
import { bookingDate } from "../domain/now";
import { tripToday, useNow } from "./useNow";
import { TicketStrip } from "./Tickets";
import { PhotoPicker } from "./Photos";
import { shrink } from "../infra/photos";
import { me } from "../infra/pocketbase";
import { MembersSheet } from "./MembersSheet";
import { HistorySheet } from "./HistorySheet";
import { create, remove, signOut, update, updateTrip, useApp } from "../app/store";
import { attempt, toast } from "./toast";
import { Sheet } from "./Sheet";
import { FillLocationsSheet } from "./FillLocationsSheet";
import { TripSettingsSheet } from "./TripSettingsSheet";

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
  const now = useNow();
  const account = me();
  const todayDate = snapshot ? tripToday(snapshot.days, now).day?.date ?? null : null;
  const isToday = (b: Booking) => !!todayDate && !!snapshot && bookingDate(b, snapshot.trip.start) === todayDate;
  const [editing, setEditing] = useState<Booking | "new" | null>(null);
  const [settings, setSettings] = useState(false);
  const [fill, setFill] = useState(false);
  const [tripSettings, setTripSettings] = useState(false);
  const [members, setMembers] = useState(false);
  const [history, setHistory] = useState(false);
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
              const today = isToday(b);
              return (
                <div key={b.id} className={`li ${today ? "bk-today" : ""}`} style={{ gridTemplateColumns: "28px minmax(0,1fr) auto", alignItems: "start" }}>
                  <Icon className="icon" style={{ marginTop: 2, color: "var(--ink3)" }} />
                  <button style={{ textAlign: "left", minWidth: 0 }} onClick={() => setEditing(b)}>
                    <div className="li-title">{b.title}{today && <span className="today-b">오늘</span>}</div>
                    <div className="li-sub">{b.when ? <span className="num">{b.when}</span> : <span style={{ color: "var(--danger)" }}>일시 미정</span>}</div>
                    {b.memo && <div className="li-sub keep" style={{ color: "var(--ink2)" }}>{b.memo}</div>}
                    {b.code && <div className="li-sub num" style={{ color: "var(--ink)", fontWeight: 600 }}>예약번호 {b.code}</div>}
                  </button>
                  <div style={{ display: "flex" }}>
                    {b.code && <button className="icon-btn" aria-label="예약번호 복사" onClick={() => copy(b.code, "예약번호를 복사했어요")}><Copy className="icon" /></button>}
                    {b.link && <a className="icon-btn" href={b.link} target="_blank" rel="noopener noreferrer" aria-label="예약 링크 열기"><ExternalLink className="icon" /></a>}
                  </div>
                  {b.files.length > 0 && <div style={{ gridColumn: "2 / -1" }}><TicketStrip booking={b} /><div className="saved-off"><CircleCheck className="icon" />이 폰에 저장돼 오프라인에서도 열려요</div></div>}
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
            <button className="li" onClick={() => setMembers(true)}><div className="li-title">일행</div><div className="li-sub" style={{ paddingRight: 8 }}>{snapshot.members.length}명{snapshot.members.find((m) => m.role === "owner")?.user === account?.id ? ", 초대와 승인" : ""}</div></button>
            <button className="li" onClick={() => setHistory(true)}><div className="li-title">되돌리기 기록</div><div className="li-sub" style={{ paddingRight: 8 }}>AI로 바꾸기 전 일정</div></button>
            <button className="li" onClick={() => setTripSettings(true)}><div className="li-title">여행 설정</div><div className="li-sub" style={{ paddingRight: 8 }}>이름·날짜·삭제</div></button>
            <button className="li" onClick={() => setSettings(true)}><div className="li-title">{snapshot.trip.region === "domestic" ? "예산 설정" : "환율·예산 설정"}</div><div className="li-sub num" style={{ paddingRight: 8 }}>{snapshot.trip.region === "domestic" ? (snapshot.trip.budget ? `${snapshot.trip.budget.toLocaleString("ko-KR")}원` : "") : `${formatMoney(1, snapshot.trip.currency)}=${snapshot.trip.localKrw}원, $1=${snapshot.trip.usdKrw.toLocaleString()}원`}</div></button>
            <button className="li" onClick={() => setFill(true)}>
              <div className="li-title">위치 없는 장소 채우기</div>
              <div className="li-sub num" style={{ paddingRight: 8 }}>{snapshot.items.filter((i) => i.place && i.lat === null).length + snapshot.places.filter((p) => p.lat === null).length}곳</div>
            </button>
            <div className="li"><div className="li-sub" style={{ marginTop: 0 }}>버전</div><div className="li-sub num" id="build-id" style={{ paddingRight: 8, marginTop: 0 }}>{__BUILD_ID__}</div></div>
            {account && <div className="li"><div className="li-title">{account.name}</div><div className="li-sub" style={{ paddingRight: 8, marginTop: 0 }}>@{account.username}</div></div>}
            {account?.admin && <a className="li" href="/admin" style={{ textDecoration: "none", color: "inherit" }}><div className="li-title">관리자 페이지</div><div className="li-sub" style={{ paddingRight: 8 }}>가입자·권한·접속 기록</div></a>}
            <button className="li" onClick={signOut}><div className="li-title" style={{ display: "flex", gap: 6, alignItems: "center" }}><LogOut className="icon" />이 폰에서 나가기</div></button>
          </div>
        </div>
      </div>
      {editing && <BookingSheet booking={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
      {fill && <FillLocationsSheet onClose={() => setFill(false)} />}
      {tripSettings && <TripSettingsSheet onClose={() => setTripSettings(false)} />}
      {members && <MembersSheet onClose={() => setMembers(false)} />}
      {history && <HistorySheet onClose={() => setHistory(false)} />}
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
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<File[]>([]);

  async function save() {
    const data = {
      type, title: title.trim(), when, code: code.trim(), memo, link: link.trim(),
      // tickets carry QR codes and small print: keep them sharper than memo photos
      ...(added.length ? { "files+": await Promise.all(added.map((f) => shrink(f, 2400, 0.9))) } : {}),
      ...(removed.size ? { "files-": [...removed] } : {}),
    };
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
      <div className="field"><span>티켓·확인서</span>
        <PhotoPicker itemId={booking?.id ?? null} collection="bookings" label="티켓" existing={booking?.files ?? []} removed={removed} added={added}
          onRemoveExisting={(f) => setRemoved((r) => new Set(r).add(f))} onAdd={(fs) => setAdded((a) => [...a, ...fs])} onRemoveAdded={(i) => setAdded((a) => a.filter((_, k) => k !== i))} />
        <small className="hint">탑승권·QR·확인서 화면을 캡처해 붙이면 인터넷 없이도 열려요. PDF는 화면 캡처로 붙여 주세요.</small>
      </div>
      <label className="field"><span>링크</span><input id="bk-link" className="input" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>
    </Sheet>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const trip = snapshot!.trip;
  const domestic = trip.region === "domestic";
  const money = moneyOf(trip.currency).money;
  const [local, setLocal] = useState(String(trip.localKrw));
  const [usd, setUsd] = useState(String(trip.usdKrw));
  const [budget, setBudget] = useState(String(trip.budget || ""));
  const [loading, setLoading] = useState(false);
  const valid = domestic || (Number(local) > 0 && Number(usd) > 0);

  async function loadToday() {
    setLoading(true);
    const r = await todaysKrwRates([trip.currency, "USD"]);
    setLoading(false);
    if (!r) { toast("환율을 불러오지 못했어요. 연결을 확인해 주세요."); return; }
    if (r[trip.currency]) setLocal(String(r[trip.currency]));
    if (r.USD) setUsd(String(r.USD));
  }

  async function save() {
    const data = domestic ? { budget: Number(budget) || 0 } : { localKrw: Number(local), usdKrw: Number(usd), budget: Number(budget) || 0 };
    if (await attempt(() => updateTrip(data), "저장했어요")) onClose();
  }

  return (
    <Sheet title={domestic ? "예산 설정" : "환율·예산 설정"} onClose={onClose} footer={<button className="btn primary" disabled={!valid} onClick={save}>저장</button>}>
      {!domestic && <>
        <label className="field"><span>1{money}은 몇 원?</span><input id="set-local" className="input num" inputMode="decimal" value={local} onChange={(e) => setLocal(e.target.value)} /></label>
        <label className="field"><span>1달러는 몇 원?</span><input id="set-usd" className="input num" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} /></label>
        <button type="button" className="btn ghost sm" disabled={loading} onClick={loadToday}>{loading ? "불러오는 중" : "오늘 환율 불러오기"}</button>
      </>}
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
