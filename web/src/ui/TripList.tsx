import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { newTrip, openTrip, useApp } from "../app/store";
import { nightsLabel, sortTrips, tripStatus, type TripSummary } from "../domain/trips";
import { pb } from "../infra/pocketbase";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";
import { shortDay, todayIso } from "./format";

/** After entering: every trip we share, the next one first. Tapping a card opens that trip. */
export function TripList() {
  const { trips, online } = useApp();
  const [creating, setCreating] = useState(false);
  const today = todayIso();
  const me = pb.authStore.record?.name as string | undefined;

  if (!trips) {
    return <div className="app"><div className="empty" style={{ marginTop: "40vh" }}>{online ? "여행을 불러오는 중이에요" : "오프라인이에요. 연결되면 여행 목록을 불러와요."}</div></div>;
  }
  const { coming, past } = sortTrips(trips, today);

  return (
    <div className="app">
      <header className="trips-top">
        <h1>우리 여행</h1>
        {me && <span className="trips-who">{me}로 보는 중</span>}
      </header>
      <div className="screen ground trips-list">
        {trips.length === 0 && <div className="empty">아직 여행이 없어요.<br />오른쪽 아래 + 새 여행으로 시작해 보세요.</div>}
        {coming.length > 0 && <div className="group-label">다가오는 여행</div>}
        {coming.map((t) => <TripCard key={t.id} trip={t} today={today} />)}
        {past.length > 0 && <div className="group-label">다녀온 여행</div>}
        {past.map((t) => <TripCard key={t.id} trip={t} today={today} />)}
      </div>
      <button className="fab fab-wide" onClick={() => setCreating(true)}><Plus className="icon" />새 여행</button>
      {creating && <NewTripSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function TripCard({ trip, today }: { trip: TripSummary; today: string }) {
  const s = tripStatus(trip, today);
  const sub = s.kind === "ongoing" && trip.dayTitles[today] ? `오늘: ${trip.dayTitles[today]}` : trip.cities.join(" · ");
  return (
    <button className={`trip-card ${s.kind === "past" ? "past" : ""}`} onClick={() => void openTrip(trip.id)}>
      {s.kind === "upcoming" && <span className="dday"><b className="num">{s.dday === 0 ? "D-day" : `D-${s.dday}`}</b><small>{shortDay(trip.start).split(" ")[0]} 출발</small></span>}
      {s.kind === "ongoing" && <span className="dday live"><b className="num">{s.dayN}일차</b><small>여행 중</small></span>}
      {s.kind === "past" && <span className="dday past"><b className="num">{trip.start.slice(0, 4)}</b><small>{Number(trip.start.slice(5, 7))}월</small></span>}
      <span style={{ minWidth: 0 }}>
        <span className="trip-title">{trip.title}</span>
        <span className="trip-meta num"><span>{shortDay(trip.start)} – {shortDay(trip.end)}</span><span>{nightsLabel(trip)}</span></span>
        {sub && <span className="trip-sub">{sub}</span>}
      </span>
      <ChevronRight className="icon" style={{ color: "var(--box)" }} />
    </button>
  );
}

function NewTripSheet({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = title.trim() && start && end && end >= start;
  const preview = valid ? nightsLabel({ start, end }) : null;
  const days = valid ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 0;

  async function save() {
    setBusy(true);
    const ok = await attempt(() => newTrip(title.trim(), start, end), "새 여행을 만들었어요");
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title="새 여행" onClose={onClose} footer={<button className="btn primary" disabled={!valid || busy || days > 60} onClick={save}>만들기</button>}>
      <label className="field"><span>여행 이름</span><input id="trip-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 도쿄 여행" autoFocus /></label>
      <div className="row2">
        <label className="field"><span>출발</span><input id="trip-start" className="input" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!end || e.target.value > end) setEnd(e.target.value); }} /></label>
        <label className="field"><span>도착</span><input id="trip-end" className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {preview && days <= 60 && <p className="note-box"><b>{preview}</b>이에요. 1일차부터 {days}일차까지 빈 일정이 만들어지고, 둘 다 같이 볼 수 있어요. 날씨·환율은 만든 뒤에 각 날짜와 설정에서 바꿀 수 있어요.</p>}
      {days > 60 && <p className="note-box" style={{ color: "var(--danger)" }}>여행 기간은 60일까지 만들 수 있어요.</p>}
    </Sheet>
  );
}
