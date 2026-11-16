import { useState } from "react";
import { removeTrip, setTripDates, updateTrip, useApp } from "../app/store";
import { nightsLabel } from "../domain/trips";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";

/** Rename, change dates (days with plans are never dropped), or delete the whole trip. */
export function TripSettingsSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const trip = snapshot?.trip;
  const [title, setTitle] = useState(trip?.title ?? "");
  const [start, setStart] = useState(trip?.start ?? "");
  const [end, setEnd] = useState(trip?.end ?? "");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (!trip) return null;
  const datesChanged = start !== trip.start || end !== trip.end;
  const valid = title.trim() && start && end && end >= start;

  async function save() {
    setBusy(true);
    const ok = await attempt(async () => {
      if (title.trim() !== trip!.title) await updateTrip({ title: title.trim() });
      if (datesChanged) await setTripDates(start, end);
    }, "저장했어요");
    setBusy(false);
    if (ok) onClose();
  }

  if (confirming) {
    return (
      <Sheet title="여행 삭제" onClose={onClose} footer={<>
        <button className="btn ghost" onClick={() => setConfirming(false)}>취소</button>
        <button className="btn primary" style={{ background: "var(--danger)" }} disabled={typed.trim() !== trip.title || busy}
          onClick={async () => { setBusy(true); const ok = await attempt(() => removeTrip(), "여행을 삭제했어요"); setBusy(false); if (ok) onClose(); }}>삭제하기</button>
      </>}>
        <p className="keep" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          일정, 장소, 경비, 준비물, 예약, 메모, 사진이 모두 지워지고 되돌릴 수 없어요. 두 폰 모두에서 사라져요.
        </p>
        <label className="field"><span>확인을 위해 여행 이름 "{trip.title}"을 그대로 입력해 주세요</span>
          <input id="trip-delete-confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      </Sheet>
    );
  }

  return (
    <Sheet title="여행 설정" onClose={onClose} footer={<>
      <button className="btn ghost danger" onClick={() => setConfirming(true)}>삭제</button>
      <button className="btn primary" disabled={!valid || busy} onClick={save}>저장</button>
    </>}>
      <label className="field"><span>여행 이름</span><input id="set-trip-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="row2">
        <label className="field"><span>출발</span><input id="set-trip-start" className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field"><span>도착</span><input id="set-trip-end" className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {valid && datesChanged && (
        <p className="note-box">{nightsLabel({ start, end })}로 바뀌어요. 늘어난 날은 빈 일정으로 생기고, 줄어든 날에 일정이 있으면 저장되지 않아요(일정을 먼저 다른 날로 옮겨 주세요).</p>
      )}
    </Sheet>
  );
}
