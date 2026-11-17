import { useEffect, useState } from "react";
import { useApp } from "../app/store";
import { listSnapshots, restoreSnapshot, type Snapshot } from "../infra/pocketbase";
import { Sheet } from "./Sheet";
import { attempt } from "./toast";

const when = (s: string) => {
  const d = new Date(s.replace(" ", "T"));
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? "오늘" : `${d.getMonth() + 1}/${d.getDate()}`} ${d.toTimeString().slice(0, 5)}`;
};

/** 더보기 > 되돌리기 기록: the state just before each AI change; restoring keeps the current state too. */
export function HistorySheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const [list, setList] = useState<Snapshot[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const tripId = snapshot?.trip.id ?? "";
  const load = () => listSnapshots(tripId).then(setList).catch(() => setList([]));
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tripId]);
  if (!snapshot) return null;
  const dayN = (id: string) => snapshot.days.find((d) => d.id === id)?.n;
  const before = (s: Snapshot) => s.days.map((d) => `${dayN(d.day) ?? "?"}일차 일정 ${d.items}개${d.groups ? `와 갈림길 ${d.groups}개` : ""}`).join(", ");

  return (
    <Sheet title="되돌리기 기록" onClose={onClose}>
      <p className="sheet-note">AI로 일정을 넣거나 바꾸기 직전 상태예요. 되돌려도 지금 상태가 먼저 보관돼서, 되돌린 것도 다시 되돌릴 수 있어요. 최근 30개까지 보관해요.</p>
      {list && list.length === 0 && <p className="sheet-note">아직 기록이 없어요.</p>}
      <div className="mem-list">
        {list?.map((s) => (
          <div key={s.id} className="mem-row hist-row">
            <div className="mem-who"><b>{s.label}</b><small>{when(s.created)}, 그때는 {before(s)}</small></div>
            {asking === s.id ? (
              <div className="mem-btns">
                <button className="btn ghost sm" onClick={() => setAsking(null)}>취소</button>
                <button className="btn primary sm" onClick={async () => { if (await attempt(() => restoreSnapshot(s.id), "되돌렸어요")) { setAsking(null); void load(); } }}>되돌리기</button>
              </div>
            ) : <button className="btn ghost sm" onClick={() => setAsking(s.id)}>되돌리기</button>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
