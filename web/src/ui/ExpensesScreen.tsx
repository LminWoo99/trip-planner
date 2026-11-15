import { useState } from "react";
import { Plus } from "lucide-react";
import type { Currency, Expense, Split } from "../domain/types";
import { formatKrw, settle, toKrw, totalsByCategory } from "../domain/money";
import { create, remove, update, useApp } from "../app/store";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";

const CATS = ["식비", "교통", "숙소", "투어", "쇼핑", "기타"];
const CUR_SIGN: Record<Currency, string> = { VND: "₫", KRW: "원", USD: "$" };
const SPLIT_LABEL: Record<Split, string> = { half: "반반", payer: "낸 사람 것", other: "상대 것 대신 결제" };

const formatAmount = (n: number, cur: Currency) =>
  cur === "USD" ? `$${n.toLocaleString("en-US")}` : `${n.toLocaleString("ko-KR")}${CUR_SIGN[cur]}`;

export function ExpensesScreen() {
  const { snapshot, meId } = useApp();
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [calc, setCalc] = useState("");
  if (!snapshot) return null;

  const { trip, members, expenses } = snapshot;
  const rates = { vndKrw: trip.vndKrw, usdKrw: trip.usdKrw };
  const total = expenses.reduce((s, e) => s + toKrw(e.amount, e.cur, rates), 0);
  const result = settle(expenses, members, rates);
  const byCat = [...totalsByCategory(expenses, rates)].sort((a, b) => b[1] - a[1]);
  const sorted = [...expenses].sort((a, b) => b.created.localeCompare(a.created));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "";

  return (
    <>
      <div className="screen ground">
        <div className="section">
          <h2>경비</h2>
          <div className="list" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>총 지출</div>
            <div className="big">{formatKrw(total)}</div>
            {trip.budget > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="bar"><i style={{ width: `${Math.min(100, (total / trip.budget) * 100)}%` }} /></div>
                <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 6 }} className="num">예산 {formatKrw(trip.budget)}의 {Math.round((total / trip.budget) * 100)}%</div>
              </div>
            )}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)", fontSize: 15, fontWeight: 600 }} className="num">
              {result ? `${result.from.displayName} → ${result.to.displayName} ${formatKrw(result.amount)}` : "정산할 돈이 없어요"}
            </div>
          </div>

          {byCat.length > 0 && (
            <>
              <div className="group-label" style={{ marginTop: 18 }}>분류별</div>
              <div className="list">
                {byCat.map(([cat, krw]) => (
                  <div className="li" key={cat}>
                    <div className="li-title">{cat}</div>
                    <div className="li-right">{formatKrw(krw)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="group-label" style={{ marginTop: 18 }}><span>동 → 원 계산기</span><span className="num" style={{ fontWeight: 500, color: "var(--ink3)" }}>1₫ = {trip.vndKrw}원</span></div>
          <div className="list" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <input id="calc-vnd" className="input num" inputMode="numeric" value={calc} placeholder="100,000" aria-label="동 금액"
              onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setCalc(d ? Number(d).toLocaleString("ko-KR") : ""); }} />
            <span className="num" style={{ fontWeight: 700, whiteSpace: "nowrap", minWidth: 96, textAlign: "right" }}>
              {calc ? formatKrw(Number(calc.replace(/,/g, "")) * trip.vndKrw) : "0원"}
            </span>
          </div>

          <div className="group-label" style={{ marginTop: 18 }}>내역 {expenses.length}건</div>
          {sorted.length === 0 ? <div className="empty">+ 버튼으로 지출을 기록해 보세요</div> : (
            <div className="list">
              {sorted.map((e) => (
                <button key={e.id} className="li" onClick={() => setEditing(e)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="li-title">{e.title}</div>
                    <div className="li-sub"><span>{nameOf(e.payer)} 결제</span><span>{SPLIT_LABEL[e.split]}</span>{e.cat && <span>{e.cat}</span>}</div>
                  </div>
                  <div className="li-right">
                    {formatAmount(e.amount, e.cur)}
                    {e.cur !== "KRW" && <div style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}>{formatKrw(toKrw(e.amount, e.cur, rates))}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button className="fab" aria-label="지출 추가" onClick={() => setEditing("new")}><Plus className="icon" /></button>
      {editing && <ExpenseSheet expense={editing === "new" ? null : editing} defaultPayer={meId ?? members[0]?.id ?? ""} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExpenseSheet({ expense, defaultPayer, onClose }: { expense: Expense | null; defaultPayer: string; onClose: () => void }) {
  const { snapshot } = useApp();
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [cur, setCur] = useState<Currency>(expense?.cur ?? "VND");
  const [payer, setPayer] = useState(expense?.payer ?? defaultPayer);
  const [split, setSplit] = useState<Split>(expense?.split ?? "half");
  const [cat, setCat] = useState(expense?.cat ?? "식비");
  const [memo, setMemo] = useState(expense?.memo ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!snapshot) return null;
  const value = Number(amount) || 0;
  const rates = { vndKrw: snapshot.trip.vndKrw, usdKrw: snapshot.trip.usdKrw };

  async function save() {
    const data = { title: title.trim(), amount: value, cur, payer, split, cat, memo };
    if (await attempt(() => (expense ? update("expenses", expense.id, data) : create("expenses", data)), expense ? "저장했어요" : "기록했어요")) onClose();
  }

  return (
    <Sheet
      title={expense ? "지출 고치기" : "지출 기록"}
      onClose={onClose}
      footer={confirmDelete ? (
        <>
          <button className="btn ghost" onClick={() => setConfirmDelete(false)}>취소</button>
          <button className="btn primary" style={{ background: "var(--danger)" }} onClick={async () => { if (expense && await attempt(() => remove("expenses", expense.id), "삭제했어요")) onClose(); }}>삭제하기</button>
        </>
      ) : (
        <>
          {expense && <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>삭제</button>}
          <button className="btn primary" disabled={!title.trim() || value <= 0 || !payer} onClick={save}>{expense ? "저장" : "기록"}</button>
        </>
      )}
    >
      <label className="field"><span>내용</span><input id="exp-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 쌀국수 두 그릇" /></label>
      <div className="field">
        <span>금액</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="exp-amount" className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
          <div className="chips" style={{ flexWrap: "nowrap" }}>
            {(["VND", "KRW", "USD"] as const).map((c) => <button key={c} type="button" className="chip" aria-pressed={cur === c} onClick={() => setCur(c)}>{CUR_SIGN[c]}</button>)}
          </div>
        </div>
        {cur !== "KRW" && value > 0 && <small className="num" style={{ fontSize: 12, color: "var(--ink3)" }}>약 {formatKrw(toKrw(value, cur, rates))}</small>}
      </div>
      <div className="field">
        <span>누가 냈어요?</span>
        <div className="chips">{snapshot.members.map((m) => <button key={m.id} type="button" className="chip" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}>{m.displayName}</button>)}</div>
      </div>
      <div className="field">
        <span>나누기</span>
        <div className="chips">{(Object.keys(SPLIT_LABEL) as Split[]).map((s) => <button key={s} type="button" className="chip" aria-pressed={split === s} onClick={() => setSplit(s)}>{SPLIT_LABEL[s]}</button>)}</div>
      </div>
      <div className="field">
        <span>분류</span>
        <div className="chips">{CATS.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
      </div>
      <label className="field"><span>메모</span><input id="exp-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
    </Sheet>
  );
}
