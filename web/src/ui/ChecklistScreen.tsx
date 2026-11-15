import { useState } from "react";
import { Check, Plus } from "lucide-react";
import type { ChecklistItem } from "../domain/types";
import { create, remove, update, useApp } from "../app/store";
import { attempt } from "./toast";
import { Sheet } from "./Sheet";

const CATS = ["서류·결제", "옷", "전자기기", "세면·약", "기타"];
const WHO = ["같이", "민우", "려진"];

export function ChecklistScreen() {
  const { snapshot } = useApp();
  const [editing, setEditing] = useState<ChecklistItem | "new" | null>(null);
  const [who, setWho] = useState("전체");
  if (!snapshot) return null;

  const all = [...snapshot.checklist].sort((a, b) => a.order - b.order);
  const list = all.filter((c) => who === "전체" || c.who === who);
  const done = all.filter((c) => c.done).length;
  const cats = [...CATS, ...new Set(all.map((c) => c.cat).filter((c) => !CATS.includes(c)))];

  return (
    <>
      <div className="screen ground">
        <div className="section">
          <h2>준비물</h2>
          <div className="list" style={{ padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }} className="num">
              <span>챙긴 것</span><span>{done} / {all.length}</span>
            </div>
            <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} /></div>
          </div>
          <div className="chips" style={{ marginBottom: 6 }}>
            {["전체", ...WHO].map((w) => <button key={w} className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{w}</button>)}
          </div>
          {cats.map((cat) => {
            const rows = list.filter((c) => (c.cat || "기타") === cat);
            if (rows.length === 0) return null;
            return (
              <div key={cat}>
                <div className="group-label" style={{ marginTop: 18 }}><span>{cat}</span><span className="num" style={{ fontWeight: 500, color: "var(--ink3)" }}>{rows.filter((r) => r.done).length}/{rows.length}</span></div>
                <div className="list">
                  {rows.map((c) => (
                    <div key={c.id} className={`li with-check ${c.done ? "is-done" : ""}`}>
                      <button className="check" style={{ margin: 0 }} role="checkbox" aria-checked={c.done} aria-label={`${c.text} 챙김`} onClick={() => void attempt(() => update("checklist", c.id, { done: !c.done }))}>
                        <span className="box"><Check className="icon" /></span>
                      </button>
                      <button style={{ textAlign: "left", minWidth: 0 }} onClick={() => setEditing(c)}>
                        <div className="li-title">{c.text}</div>
                        {c.memo && <div className="li-sub keep">{c.memo}</div>}
                      </button>
                      <span className="li-sub" style={{ paddingRight: 10 }}>{c.who}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button className="fab" aria-label="준비물 추가" onClick={() => setEditing("new")}><Plus className="icon" /></button>
      {editing && <ChecklistSheet item={editing === "new" ? null : editing} nextOrder={Math.max(0, ...all.map((c) => c.order)) + 1} onClose={() => setEditing(null)} />}
    </>
  );
}

function ChecklistSheet({ item, nextOrder, onClose }: { item: ChecklistItem | null; nextOrder: number; onClose: () => void }) {
  const [text, setText] = useState(item?.text ?? "");
  const [cat, setCat] = useState(item?.cat ?? "기타");
  const [who, setWho] = useState(item?.who ?? "같이");
  const [memo, setMemo] = useState(item?.memo ?? "");

  async function save() {
    const data = { text: text.trim(), cat, who, memo };
    if (await attempt(() => (item ? update("checklist", item.id, data) : create("checklist", { ...data, order: nextOrder })), item ? "저장했어요" : "추가했어요")) onClose();
  }

  return (
    <Sheet title={item ? "준비물 고치기" : "준비물 추가"} onClose={onClose} footer={<>
      {item && <button className="btn ghost danger" onClick={async () => { if (await attempt(() => remove("checklist", item.id), "삭제했어요")) onClose(); }}>삭제</button>}
      <button className="btn primary" disabled={!text.trim()} onClick={save}>{item ? "저장" : "추가"}</button>
    </>}>
      <label className="field"><span>이름</span><input id="check-text" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 보조배터리" /></label>
      <div className="field"><span>분류</span><div className="chips">{CATS.map((c) => <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div></div>
      <div className="field"><span>담당</span><div className="chips">{WHO.map((w) => <button key={w} type="button" className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{w}</button>)}</div></div>
      <label className="field"><span>메모</span><input id="check-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
    </Sheet>
  );
}
