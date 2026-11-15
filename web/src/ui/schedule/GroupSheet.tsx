import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Branch, BranchKey, Group } from "../../domain/types";
import { create, remove, update, useApp } from "../../app/store";
import { attempt } from "../toast";
import { Sheet } from "../Sheet";

const KEYS: BranchKey[] = ["A", "B", "C", "D"];

/** Add or edit a fork: title, when to decide, and 2–4 plans with their condition. */
export function GroupSheet({ group, day, onClose }: { group: Group | null; day: string; onClose: () => void }) {
  const { snapshot } = useApp();
  const [title, setTitle] = useState(group?.title ?? "");
  const [decideAt, setDecideAt] = useState(group?.decideAt ?? "");
  const [branches, setBranches] = useState<Branch[]>(
    group ? [...group.branches] : [{ key: "A", label: "플랜 A", condition: "" }, { key: "B", label: "플랜 B", condition: "" }],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;

  const setBranch = (i: number, patch: Partial<Branch>) => setBranches(branches.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const relabel = (list: Branch[]) => list.map((b, i) => ({ ...b, key: KEYS[i], label: `플랜 ${KEYS[i]}` }));
  const removedKeys = group ? group.branches.slice(branches.length).map((b) => b.key) : [];
  const orphanCount = group ? snapshot.items.filter((i) => i.group === group.id && removedKeys.includes(i.branch as BranchKey)).length : 0;

  async function save() {
    const data = {
      title: title.trim(), decideAt: decideAt.trim(),
      branches: branches.map((b) => ({ ...b, condition: b.condition.trim(), note: b.note?.trim() || undefined })),
      // a removed plan can't stay selected
      ...(group?.selected && !branches.some((b) => b.key === group.selected) ? { selected: "", selectedBy: "", selectedAt: "" } : {}),
    };
    setBusy(true);
    const ok = await attempt(async () => {
      if (group) {
        await update("groups", group.id, data);
      } else {
        const orders = [
          ...snapshot!.items.filter((i) => i.day === day && !i.group).map((i) => i.order),
          ...snapshot!.groups.filter((g) => g.day === day).map((g) => g.order),
        ];
        await create("groups", { ...data, day, order: Math.max(0, ...orders) + 1 });
      }
    }, group ? "저장했어요" : "갈림길을 추가했어요");
    setBusy(false);
    if (ok) onClose();
  }

  async function del() {
    if (!group) return;
    setBusy(true);
    // items of the fork are removed with it (cascade)
    const ok = await attempt(() => remove("groups", group.id), "갈림길을 삭제했어요");
    setBusy(false);
    if (ok) onClose();
  }

  const planItems = group ? snapshot.items.filter((i) => i.group === group.id).length : 0;
  const footer = confirmDelete ? (
    <>
      <button className="btn ghost" onClick={() => setConfirmDelete(false)}>취소</button>
      <button className="btn primary" style={{ background: "var(--danger)" }} disabled={busy} onClick={del}>삭제하기</button>
    </>
  ) : (
    <>
      {group && <button className="btn ghost danger" aria-label="갈림길 삭제" onClick={() => setConfirmDelete(true)}><Trash2 className="icon" /></button>}
      <button className="btn primary" disabled={busy || !title.trim() || branches.length < 2} onClick={save}>{group ? "저장" : "추가"}</button>
    </>
  );

  return (
    <Sheet title={group ? "갈림길 고치기" : "갈림길 추가"} onClose={onClose} footer={footer}>
      {confirmDelete && <p className="keep" style={{ margin: 0, fontSize: 14 }}>갈림길과 그 안의 일정 {planItems}개가 모두 삭제돼요.</p>}
      <label className="field">
        <span>제목</span>
        <input id="group-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 판시판 날씨 보고 결정" />
      </label>
      <label className="field">
        <span>언제 정해요?</span>
        <input id="group-decide" className="input" value={decideAt} onChange={(e) => setDecideAt(e.target.value)} placeholder="예: 호텔 도착 직후" />
      </label>
      {branches.map((b, i) => (
        <div key={b.key} className="field" style={{ gap: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            플랜 {b.key}
            {branches.length > 2 && i === branches.length - 1 && (
              <button type="button" className="btn-text" style={{ height: 32 }} onClick={() => setBranches(relabel(branches.slice(0, -1)))}><X className="icon" />빼기</button>
            )}
          </span>
          <input id={`group-cond-${b.key}`} className="input" value={b.condition} onChange={(e) => setBranch(i, { condition: e.target.value })} placeholder="조건, 예: 날씨 좋음 → 판시판 바로 출발" />
          <input id={`group-note-${b.key}`} className="input" value={b.note ?? ""} onChange={(e) => setBranch(i, { note: e.target.value })} placeholder="다른 날에 미치는 영향 (선택)" />
        </div>
      ))}
      {orphanCount > 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>뺀 플랜에 일정 {orphanCount}개가 있어요. 저장해도 그 일정은 지워지지 않지만 화면에 안 보여요.</p>}
      {branches.length < 4 && (
        <button type="button" className="e-add" style={{ paddingLeft: 0 }} onClick={() => setBranches(relabel([...branches, { key: "A", label: "", condition: "" }]))}>
          <Plus className="icon" />플랜 추가
        </button>
      )}
    </Sheet>
  );
}
