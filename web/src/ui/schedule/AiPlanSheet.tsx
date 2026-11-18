import { useState } from "react";
import { Check, CircleAlert, MapPin } from "lucide-react";
import { useApp } from "../../app/store";
import { aiPlan, applyPlan, type PlanItem } from "../../infra/pocketbase";
import { bestRated, findPlace, hasGoogleKey } from "../../infra/google";
import { Sheet } from "../Sheet";
import { shortDay } from "../format";
import { toast } from "../toast";

type Row = PlanItem & { key: string; on: boolean; found: "yes" | "no" | "none" };
type DayPlan = { day: string; n: number; date: string; rows: Row[] };

/** Write the plan in your own words → AI splits it into days → check the preview → add. */
export function AiPlanSheet({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const [step, setStep] = useState<"write" | "thinking" | "preview">("write");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [plan, setPlan] = useState<DayPlan[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const days = [...snapshot.days].sort((a, b) => a.n - b.n);

  async function split() {
    setStep("thinking");
    try {
      const res = await aiPlan(snapshot!.trip.id, text);
      const out: DayPlan[] = await Promise.all(res.days.map(async (d) => {
        const day = days.find((x) => x.n === d.n)!;
        const rows = await Promise.all(d.items.map(async (it, i): Promise<Row> => {
          if (!it.place || !hasGoogleKey() || !navigator.onLine) return { ...it, key: `${d.n}-${i}`, on: true, found: "none" };
          try {
            // recommended restaurants and cafes: keep the best-rated of the AI's picks (abroad, where Google has the reviews)
            if (it.candidates?.length && snapshot!.trip.region === "abroad") {
              const best = await bestRated(it.candidates, day.city);
              if (best) {
                const score = `Google 평점 ${best.rating.toFixed(1)} (${best.reviews.toLocaleString("ko-KR")})`;
                return { ...it, place: best.name, placeId: best.placeId, lat: best.lat, lng: best.lng, memo: [score, it.memo].filter(Boolean).join(" · "), key: `${d.n}-${i}`, on: true, found: "yes" };
              }
            }
            const p = await findPlace(it.place, day.city);
            return p ? { ...it, place: p.name, placeId: p.placeId, lat: p.lat, lng: p.lng, key: `${d.n}-${i}`, on: true, found: "yes" }
              : { ...it, key: `${d.n}-${i}`, on: false, found: "no" };
          } catch {
            return { ...it, key: `${d.n}-${i}`, on: true, found: "none" };
          }
        }));
        return { day: day.id, n: day.n, date: day.date, rows };
      }));
      setPlan(out.filter((d) => d.rows.length));
      setStep("preview");
    } catch (e) {
      toast((e as { response?: { message?: string } }).response?.message || "일정을 나누지 못했어요. 다시 해 주세요.");
      setStep("write");
    }
  }

  const chosen = plan.map((d) => ({ ...d, rows: d.rows.filter((r) => r.on) })).filter((d) => d.rows.length);
  const count = chosen.reduce((n, d) => n + d.rows.length, 0);
  const touched = chosen.map((d) => ({
    n: d.n,
    items: snapshot.items.filter((i) => i.day === d.day).length,
    groups: snapshot.groups.filter((g) => g.day === d.day).length,
    first: snapshot.items.filter((i) => i.day === d.day && !i.group).sort((a, b) => a.order - b.order)[0]?.title,
  })).filter((t) => t.items || t.groups);

  async function apply(m: "append" | "replace") {
    setBusy(true);
    try {
      const { added } = await applyPlan(snapshot!.trip.id, m, chosen.map((d) => ({ day: d.day, items: d.rows.map(({ key: _k, on: _o, found, candidates: _c, ...it }) => (found === "no" ? { ...it, place: "" } : it)) })));
      toast(m === "replace" ? `일정을 바꿨어요. 원래 일정은 되돌리기 기록에 있어요` : `${added}개 넣었어요`);
      onClose();
    } catch (e) {
      toast((e as { response?: { message?: string } }).response?.message || "넣지 못했어요. 다시 해 주세요.");
      setBusy(false);
    }
  }

  const toggle = (dk: string, rk: string) => setPlan((p) => p.map((d) => (d.day !== dk ? d : { ...d, rows: d.rows.map((r) => (r.key === rk ? { ...r, on: !r.on } : r)) })));

  if (step !== "preview") {
    return (
      <Sheet title="글로 일정 넣기" onClose={onClose} footer={<button className="btn primary" disabled={step === "thinking" || text.trim().length < 4} onClick={split}>{step === "thinking" ? "나누는 중이에요" : "일정으로 나누기"}</button>}>
        <p className="sheet-note">날짜별로 할 일을 편하게 쓰면 AI가 일정으로 나눠요. 시간이나 장소를 쓰면 같이 넣어요.</p>
        <textarea id="ai-plan-text" className="input ai-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} aria-label="여행 계획"
          placeholder={"예: 첫째 날 오후 3시쯤 호안끼엠 호수 산책하고 저녁은 분짜.\n2일차는 알아서 추천해 줘\n3일차 오후는 맛집이랑 카페 위주로 추천해 줘"} />
        <p className="sheet-note" style={{ marginTop: 6 }}>"알아서 추천해 줘"라고 쓰면 많이 가는 코스를 찾아 짜고, 식당·카페는 평점 높은 곳으로 골라요. 30초~1분쯤 걸려요.</p>
        <div className="seg2" role="radiogroup" aria-label="넣는 방식">
          <button role="radio" aria-checked={mode === "append"} onClick={() => setMode("append")}>기존 일정 뒤에 붙이기</button>
          <button role="radio" aria-checked={mode === "replace"} onClick={() => setMode("replace")}>그 날 일정 바꾸기</button>
        </div>
        <p className="sheet-note">붙이기는 원래 일정을 건드리지 않아요. 어느 쪽이든 넣기 전 상태를 되돌리기 기록에 보관해요.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title="이렇게 넣을게요" onClose={onClose} footer={<>
      <button className="btn ghost" onClick={() => setStep("write")}>다시 쓰기</button>
      <button className="btn primary" disabled={busy || count === 0} onClick={() => (mode === "replace" && touched.length ? setConfirm(true) : apply(mode))}>{count}개 {mode === "replace" ? "바꿔 넣기" : "추가"}</button>
    </>}>
      {plan.length === 0 && <p className="sheet-note">글에서 날짜별 일정을 찾지 못했어요. "첫째 날", "2일차"처럼 날짜를 함께 써 주세요.</p>}
      {plan.map((d) => (
        <div key={d.day} className="ai-day">
          <div className="ai-day-h">{d.n}일차 <small>{shortDay(d.date)}</small></div>
          {d.rows.map((r) => (
            <button key={r.key} className={`ai-row ${r.on ? "" : "off"}`} role="checkbox" aria-checked={r.on} onClick={() => toggle(d.day, r.key)}>
              <span className="ai-k">{r.on && <Check className="icon" />}</span>
              <span className="ai-t num">{r.time || "시간 없음"}</span>
              <span className="ai-main">
                <b>{r.title}</b>
                {r.found === "yes" && <small className="ok"><MapPin className="icon" />{r.place}</small>}
                {r.found === "no" && <small className="ask"><CircleAlert className="icon" />장소를 못 찾았어요. 장소 없이 넣으려면 체크하세요</small>}
                {r.found === "none" && r.place && <small><MapPin className="icon" />{r.place}</small>}
              </span>
            </button>
          ))}
        </div>
      ))}
      {confirm && (
        <div className="ai-confirm" role="alertdialog" aria-label="일정 바꾸기 확인">
          <h4>{touched.map((t) => `${t.n}일차`).join(", ")}에 있는 일정을 바꿀까요?</h4>
          <p>지금 있는 일정이 AI가 나눈 일정으로 바뀌어요. 원래 일정은 되돌리기 기록에 보관돼서 더보기에서 다시 살릴 수 있어요. 일정에 붙인 사진은 되돌리기에 포함되지 않아요.</p>
          <ul>{touched.map((t) => <li key={t.n}><b>{t.n}일차</b> 일정 {t.items}개{t.groups ? `, 갈림길 ${t.groups}개` : ""}{t.first ? ` (${t.first} 등)` : ""}</li>)}</ul>
          <div className="ai-confirm-btns">
            <button className="btn ghost" disabled={busy} onClick={() => { setConfirm(false); setMode("append"); void apply("append"); }}>뒤에 붙이기로</button>
            <button className="btn danger-fill" disabled={busy} onClick={() => apply("replace")}>바꾸기</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
