import { useState } from "react";
import { Plus, PiggyBank } from "lucide-react";
import type { Currency, Expense, Split, Trip } from "../domain/types";
import { currenciesFor, formatMoney, moneyOf } from "../domain/countries";
import { depositsByMember, formatKrw, poolBalance, ratesOf, settle, toKrw, totalSpent, totalsByCategory } from "../domain/money";
import { create, remove, update, useApp } from "../app/store";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";
import { shortDay } from "./format";
import { tripToday } from "./useNow";

const CATS = ["식비", "교통", "숙소", "투어", "쇼핑", "기타"];
const SPLIT_LABEL: Record<Split, string> = { half: "반반", payer: "낸 사람 것", other: "상대 것 대신 결제" };
const POOL = "pool";

const formatAmount = (n: number, cur: Currency) => formatMoney(n, cur);
/** the money chips on a trip: local, won, dollars (won only at home) */
const CurChips = ({ trip, cur, onPick }: { trip: Trip; cur: Currency; onPick: (c: Currency) => void }) => {
  const list = currenciesFor(trip);
  if (list.length < 2) return null;
  return <div className="chips" style={{ flexWrap: "nowrap" }}>{list.map((c) => <button key={c} type="button" className="chip" aria-pressed={cur === c} onClick={() => onPick(c)}>{moneyOf(c).sign.trim()}</button>)}</div>;
};

export function ExpensesScreen() {
  const { snapshot, meId } = useApp();
  const [view, setView] = useState<"spend" | "settle">("spend");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [depositing, setDepositing] = useState<Expense | "new" | null>(null);
  const [calc, setCalc] = useState("");
  if (!snapshot) return null;

  const { trip, members, expenses, days } = snapshot;
  const rates = ratesOf(trip);
  const spends = expenses.filter((e) => e.kind !== "deposit");
  const total = totalSpent(expenses, rates);
  const byCat = [...totalsByCategory(expenses, rates)].sort((a, b) => b[1] - a[1]);
  const pool = [...poolBalance(expenses)].filter(([, v]) => v !== 0);
  const hasPool = expenses.some((e) => e.kind === "deposit" || e.fromPool);
  const nameOf = (e: Expense) => (e.fromPool ? "공용비" : members.find((m) => m.id === e.payer)?.displayName ?? "");
  const sortedDays = [...days].sort((a, b) => a.n - b.n);
  const groups = [
    ...sortedDays.map((d) => ({ key: d.id, label: `${d.n}일차 ${shortDay(d.date)}`, list: spends.filter((e) => e.day === d.id) })),
    { key: "none", label: "날짜 없음", list: spends.filter((e) => !e.day || !days.some((d) => d.id === e.day)) },
  ].filter((g) => g.list.length > 0);

  return (
    <>
      <div className="days" role="tablist" aria-label="경비 보기" style={{ borderBottom: 0, flex: "none" }}>
        <button className="pill" role="tab" aria-pressed={view === "spend"} aria-selected={view === "spend"} onClick={() => setView("spend")}>지출</button>
        <button className="pill" role="tab" aria-pressed={view === "settle"} aria-selected={view === "settle"} onClick={() => setView("settle")}>정산</button>
      </div>
      <div className="screen ground">
        {view === "spend" ? (
          <div className="section">
            <div className="list" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: "var(--ink2)" }}>총 지출</div>
              <div className="big">{formatKrw(total)}</div>
              {trip.budget > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="bar"><i style={{ width: `${Math.min(100, (total / trip.budget) * 100)}%` }} /></div>
                  <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 6 }} className="num">예산 {formatKrw(trip.budget)}의 {Math.round((total / trip.budget) * 100)}%</div>
                </div>
              )}
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
                <PiggyBank className="icon" style={{ color: "var(--ink3)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink2)" }}>공용비 잔액</div>
                  <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>
                    {pool.length ? pool.map(([cur, v]) => formatAmount(v, cur)).join(" · ") : hasPool ? "0₫" : "아직 없어요"}
                  </div>
                </div>
                <button className="btn-text" onClick={() => setDepositing("new")}><Plus className="icon" />넣기</button>
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

            {groups.length === 0 ? <div className="empty">+ 버튼으로 쓴 돈을 기록해 보세요</div> : groups.map((g) => (
              <div key={g.key}>
                <div className="group-label" style={{ marginTop: 18 }}>
                  <span>{g.label}</span>
                  <span className="num" style={{ fontWeight: 600 }}>{formatKrw(g.list.reduce((s, e) => s + toKrw(e.amount, e.cur, rates), 0))}</span>
                </div>
                <div className="list">
                  {[...g.list].sort((a, b) => b.created.localeCompare(a.created)).map((e) => (
                    <button key={e.id} className="li" onClick={() => setEditing(e)}>
                      <div style={{ minWidth: 0 }}>
                        <div className="li-title">{e.title}</div>
                        <div className="li-sub"><span>{nameOf(e)}</span>{e.cat && <span>{e.cat}</span>}</div>
                      </div>
                      <div className="li-right">
                        {formatAmount(e.amount, e.cur)}
                        {e.cur !== "KRW" && <div style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}>{formatKrw(toKrw(e.amount, e.cur, rates))}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {trip.region === "abroad" && <>
            <div className="group-label" style={{ marginTop: 18 }}><span>{moneyOf(trip.currency).money} → 원 계산기</span><span className="num" style={{ fontWeight: 500, color: "var(--ink3)" }}>{formatMoney(1, trip.currency)} = {trip.localKrw}원</span></div>
            <div className="list" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <input id="calc-vnd" className="input num" inputMode="numeric" value={calc} placeholder="100,000" aria-label={`${moneyOf(trip.currency).money} 금액`}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setCalc(d ? Number(d).toLocaleString("ko-KR") : ""); }} />
              <span className="num" style={{ fontWeight: 700, whiteSpace: "nowrap", minWidth: 96, textAlign: "right" }}>
                {calc ? formatKrw(Number(calc.replace(/,/g, "")) * trip.localKrw) : "0원"}
              </span>
            </div>
            </>}
          </div>
        ) : (
          <SettleView onEditDeposit={(e) => setDepositing(e)} />
        )}
      </div>
      <button className="fab" aria-label="지출 추가" onClick={() => setEditing("new")}><Plus className="icon" /></button>
      {editing && <ExpenseSheet expense={editing === "new" ? null : editing} defaultPayer={meId ?? members[0]?.id ?? ""} onClose={() => setEditing(null)} />}
      {depositing && <DepositSheet deposit={depositing === "new" ? null : depositing} defaultPayer={meId ?? members[0]?.id ?? ""} onClose={() => setDepositing(null)} />}
    </>
  );
}

function SettleView({ onEditDeposit }: { onEditDeposit: (e: Expense) => void }) {
  const { snapshot } = useApp();
  if (!snapshot) return null;
  const { trip, members, expenses } = snapshot;
  const rates = ratesOf(trip);
  const result = settle(expenses, members, rates);
  const deposits = expenses.filter((e) => e.kind === "deposit");
  const byMember = depositsByMember(expenses, rates);
  const personal = expenses.filter((e) => e.kind !== "deposit" && !e.fromPool && e.split !== "payer");

  return (
    <div className="section">
      <div className="list" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: "var(--ink2)" }}>정산</div>
        <div className="big" style={{ fontSize: 22, marginTop: 2 }}>
          {result ? `${result.from.displayName} → ${result.to.displayName} ${formatKrw(result.amount)}` : "보낼 돈이 없어요"}
        </div>
        <p className="keep" style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink3)", lineHeight: 1.5 }}>
          공용비로 쓴 돈은 둘이 같이 쓴 걸로 보고 빼요. 공용비를 넣은 금액이 다르면 차액의 절반, 개인이 낸 돈은 고른 나누기 방식대로 계산해요.
        </p>
      </div>

      <div className="group-label" style={{ marginTop: 18 }}>공용비에 넣은 돈</div>
      <div className="list">
        {members.map((m) => (
          <div className="li" key={m.id}>
            <div className="li-title">{m.displayName}</div>
            <div className="li-right">{formatKrw(byMember.get(m.id) ?? 0)}</div>
          </div>
        ))}
        {deposits.map((d) => (
          <button className="li" key={d.id} onClick={() => onEditDeposit(d)}>
            <div className="li-sub" style={{ marginTop: 0 }}>{members.find((m) => m.id === d.payer)?.displayName} 입금{d.memo ? `, ${d.memo}` : ""}</div>
            <div className="li-right" style={{ fontWeight: 500, fontSize: 13 }}>{formatAmount(d.amount, d.cur)}</div>
          </button>
        ))}
      </div>

      <div className="group-label" style={{ marginTop: 18 }}>개인이 낸 같이 쓴 돈</div>
      {personal.length === 0 ? <div className="empty" style={{ padding: 16 }}>없어요</div> : (
        <div className="list">
          {personal.map((e) => (
            <div className="li" key={e.id}>
              <div style={{ minWidth: 0 }}>
                <div className="li-title">{e.title}</div>
                <div className="li-sub"><span>{members.find((m) => m.id === e.payer)?.displayName} 결제</span><span>{SPLIT_LABEL[e.split]}</span></div>
              </div>
              <div className="li-right">{formatAmount(e.amount, e.cur)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseSheet({ expense, defaultPayer, onClose }: { expense: Expense | null; defaultPayer: string; onClose: () => void }) {
  const { snapshot } = useApp();
  const todayDay = snapshot ? tripToday(snapshot.days, new Date()).day?.id ?? "" : "";
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [cur, setCur] = useState<Currency>(expense?.cur ?? snapshot!.trip.currency);
  const [payer, setPayer] = useState(expense ? (expense.fromPool ? POOL : expense.payer ?? defaultPayer) : defaultPayer);
  const [split, setSplit] = useState<Split>(expense?.split ?? "half");
  const [cat, setCat] = useState(expense?.cat ?? "식비");
  const [day, setDay] = useState(expense ? expense.day ?? "" : todayDay);
  const [memo, setMemo] = useState(expense?.memo ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!snapshot) return null;
  const value = Number(amount) || 0;
  const rates = ratesOf(snapshot.trip);
  const fromPool = payer === POOL;

  async function save() {
    const data = {
      kind: "spend", title: title.trim(), amount: value, cur, cat, memo, day,
      fromPool, payer: fromPool ? "" : payer, split: fromPool ? "half" : split,
    };
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
          <CurChips trip={snapshot!.trip} cur={cur} onPick={setCur} />
        </div>
        {cur !== "KRW" && value > 0 && <small className="num" style={{ fontSize: 12, color: "var(--ink3)" }}>약 {formatKrw(toKrw(value, cur, rates))}</small>}
      </div>
      <div className="field">
        <span>누가 냈어요?</span>
        <div className="chips">
          {snapshot.members.map((m) => <button key={m.id} type="button" className="chip" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}>{m.displayName}</button>)}
          <button type="button" className="chip" aria-pressed={fromPool} onClick={() => setPayer(POOL)}>공용비</button>
        </div>
      </div>
      <div className="field">
        <span>분류</span>
        <div className="chips">{CATS.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>
      </div>
      <label className="field">
        <span>날짜</span>
        <select id="exp-day" className="input" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">날짜 없음</option>
          {[...snapshot.days].sort((a, b) => a.n - b.n).map((d) => <option key={d.id} value={d.id}>{d.n}일차 {shortDay(d.date)}</option>)}
        </select>
      </label>
      <label className="field"><span>메모</span><input id="exp-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      {!fromPool && (
        <div className="field">
          <span>정산할 때 나누기 <small style={{ fontWeight: 400, color: "var(--ink3)" }}>정산 안 하면 그냥 두세요</small></span>
          <div className="chips">{(Object.keys(SPLIT_LABEL) as Split[]).map((s) => <button key={s} type="button" className="chip" aria-pressed={split === s} onClick={() => setSplit(s)}>{SPLIT_LABEL[s]}</button>)}</div>
        </div>
      )}
    </Sheet>
  );
}

function DepositSheet({ deposit, defaultPayer, onClose }: { deposit: Expense | null; defaultPayer: string; onClose: () => void }) {
  const { snapshot } = useApp();
  const [payer, setPayer] = useState(deposit?.payer ?? defaultPayer);
  const [amount, setAmount] = useState(deposit ? String(deposit.amount) : "");
  const [cur, setCur] = useState<Currency>(deposit?.cur ?? snapshot!.trip.currency);
  const [memo, setMemo] = useState(deposit?.memo ?? "");
  if (!snapshot) return null;
  const value = Number(amount) || 0;

  async function save() {
    const data = { kind: "deposit", title: "공용비 입금", amount: value, cur, payer, fromPool: false, split: "half", cat: "", memo, day: "" };
    if (await attempt(() => (deposit ? update("expenses", deposit.id, data) : create("expenses", data)), "공용비에 넣었어요")) onClose();
  }

  return (
    <Sheet title={deposit ? "공용비 입금 고치기" : "공용비 넣기"} onClose={onClose} footer={<>
      {deposit && <button className="btn ghost danger" onClick={async () => { if (await attempt(() => remove("expenses", deposit.id), "삭제했어요")) onClose(); }}>삭제</button>}
      <button className="btn primary" disabled={value <= 0 || !payer} onClick={save}>넣기</button>
    </>}>
      <div className="field">
        <span>누가 넣었어요?</span>
        <div className="chips">{snapshot.members.map((m) => <button key={m.id} type="button" className="chip" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}>{m.displayName}</button>)}</div>
      </div>
      <div className="field">
        <span>금액</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input id="dep-amount" className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="1000000" />
          <CurChips trip={snapshot!.trip} cur={cur} onPick={setCur} />
        </div>
      </div>
      <label className="field"><span>메모</span><input id="dep-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 환전한 현금" /></label>
    </Sheet>
  );
}
