import { useMemo, useState } from "react";
import { COLORS, DRAWABLE, parseGarment, SLOT_LABEL, type Garment, type Look } from "../../domain/outfit";
import { aiClothes } from "../../infra/pocketbase";
import { Sheet } from "../Sheet";
import { Avatar } from "./Avatar";

/** Write the day's clothes one per line; the avatar dresses up as you type. Unknown words go to the AI on save. */
export function OutfitSheet({ title, look, items, aiAllowed, partnerName, onSave, onClose }: {
  title: string; look: Look; items: readonly Garment[]; aiAllowed: boolean; partnerName: string | null;
  onSave: (items: Garment[]) => Promise<boolean>; onClose: () => void;
}) {
  const [text, setText] = useState(items.map((i) => i.text).join("\n"));
  const [busy, setBusy] = useState(false);
  const packed = useMemo(() => new Map(items.map((i) => [i.text, i.packed])), [items]);
  // what the AI understood earlier stays understood
  const known = useMemo(() => new Map(items.filter((i) => i.slot).map((i) => [i.text, i])), [items]);
  const parsed = text.split("\n").map((l) => {
    const t = l.trim();
    if (!t) return null;
    const g = parseGarment(t, packed.get(t) ?? false)!;
    return g.slot ? g : known.get(t) ?? g;
  }).filter((g): g is Garment => g !== null);

  async function save() {
    setBusy(true);
    let list = parsed;
    const unknown = list.filter((g) => !g.slot).map((g) => g.text);
    if (unknown.length && aiAllowed && navigator.onLine) {
      try {
        const { items: answers } = await aiClothes(unknown, DRAWABLE.map((d) => d.type), COLORS.map((c) => c[1]));
        list = list.map((g) => {
          const a = g.slot ? null : answers.find((x) => x.text === g.text);
          const d = a && DRAWABLE.find((x) => x.type === a.type);
          const c = a && COLORS.find((x) => x[1] === a.color);
          return d ? { ...g, slot: d.slot, type: d.type, label: d.label, color: c?.[1] ?? g.color, colorName: c?.[2] ?? g.colorName } : g;
        });
      } catch { /* keep them as not understood */ }
    }
    if (await onSave(list)) onClose();
    setBusy(false);
  }

  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary" disabled={busy} onClick={save}>{busy ? "저장하는 중" : "저장"}</button>}>
      <div className="of-edit">
        <div className="of-stage"><Avatar look={look} items={parsed} label="내 코디 미리보기" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label htmlFor="outfit-text" className="of-label">입을 옷 (한 줄에 하나)</label>
          <textarea id="outfit-text" className="input of-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={"예:\n네이비 바람막이\n검정 등산바지\n트레킹화"} />
        </div>
      </div>
      {parsed.length > 0 && (
        <ul className="of-parsed" aria-live="polite">
          {parsed.map((g, i) => (
            <li key={i}>
              {g.slot && <span className="of-dot" style={{ background: g.color }} />}
              <span className="of-txt">{g.text}</span>
              <span className={`of-tag ${g.slot ? "" : "ask"}`}>{g.slot ? SLOT_LABEL[g.slot] : aiAllowed ? "저장할 때 AI가 알아봐요" : "그림에는 안 나와요"}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="sheet-note">{partnerName ? `${partnerName}에게 바로 보여요.` : "저장하면 일행에게 보여요."}</p>
    </Sheet>
  );
}
