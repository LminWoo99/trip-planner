import { useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripHorizontal, Menu, Plus, Split } from "lucide-react";
import type { BranchKey, Item } from "../../domain/types";
import { reorder, type DayEntry } from "../../domain/timeline";
import { reorderRecords } from "../../app/store";
import { attempt } from "../toast";
import { Marker } from "./ItemCard";
import { MemoToggle } from "./MemoToggle";

const entryId = (e: DayEntry) => (e.kind === "item" ? e.item.id : e.group.id);
const metaOf = (it: Item) => [it.time, it.place].filter(Boolean);

interface Props {
  entries: readonly DayEntry[];
  numbers: ReadonlyMap<string, number>;
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onOpenItem: (item: Item) => void;
  onAddItem: (group: string | null, branch: BranchKey | null) => void;
  onAddGroup: () => void;
  onEditGroup: (groupId: string) => void;
}

/** Reorder by the handle only, so the rest of the row scrolls normally on touch. */
export function EditList({ entries, numbers, selected, onToggleSelect, onOpenItem, onAddItem, onAddGroup, onEditGroup }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // common items and forks share one order sequence
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const list = entries.map((x) => ({ id: entryId(x), order: x.kind === "item" ? x.item.order : x.group.order, kind: x.kind }));
    const to = list.findIndex((x) => x.id === e.over!.id);
    const changes = reorder(list, String(e.active.id), to);
    const kindOf = new Map(list.map((x) => [x.id, x.kind]));
    void attempt(async () => {
      await reorderRecords("items", changes.filter((c) => kindOf.get(c.id) === "item"));
      await reorderRecords("groups", changes.filter((c) => kindOf.get(c.id) === "fork"));
    });
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={entries.map(entryId)} strategy={verticalListSortingStrategy}>
          <div className="edit-list">
            {entries.map((e) => e.kind === "item" ? (
              <SortableRow key={e.item.id} id={e.item.id} label={e.item.title}>
                {(handle) => (
                  <>
                    <button className="sel" role="checkbox" aria-checked={selected.has(e.item.id)} aria-label={`${e.item.title} 선택`} onClick={() => onToggleSelect(e.item.id)}>
                      <span className="box"><Check className="icon" /></span>
                    </button>
                    <div className="e-card">
                      <Marker item={e.item} n={numbers.get(e.item.id) ?? null} />
                      <div className="e-txt">
                        <button className="e-title" style={{ textAlign: "left", width: "100%" }} onClick={() => onOpenItem(e.item)}>{e.item.title}</button>
                        {metaOf(e.item).length > 0 && <div className="e-meta">{metaOf(e.item).map((m) => <span key={m}>{m}</span>)}</div>}
                        {e.item.memo && <MemoToggle memo={e.item.memo} />}
                      </div>
                    </div>
                    {handle}
                  </>
                )}
              </SortableRow>
            ) : (
              <SortableRow key={e.group.id} id={e.group.id} label={e.group.title} grip={<GripHorizontal className="icon" />}>
                {(handle) => (
                  <>
                    <span />
                    <ForkBlock entry={e} handle={handle} onOpenItem={onOpenItem} onAddItem={onAddItem} onEditGroup={onEditGroup} />
                    <span />
                  </>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="e-foot">
        <button className="e-add" onClick={() => onAddItem(null, null)}><Plus className="icon" />일정 추가</button>
        <button className="e-add" onClick={onAddGroup}><Split className="icon" />갈림길 추가</button>
      </div>
    </>
  );
}

function SortableRow({ id, label, children, className = "e-row", grip }: { id: string; label: string; children: (handle: ReactNode) => ReactNode; className?: string; grip?: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null), transition };
  const handle = (
    <button ref={setActivatorNodeRef} className="handle" aria-label={`${label} 순서 바꾸기`} {...attributes} {...listeners}>
      {grip ?? <Menu className="icon" />}
    </button>
  );
  return <div ref={setNodeRef} style={style} className={`${className} ${isDragging ? "dragging" : ""}`}>{children(handle)}</div>;
}

function ForkBlock({ entry, handle, onOpenItem, onAddItem, onEditGroup }: {
  entry: Extract<DayEntry, { kind: "fork" }>;
  handle: ReactNode;
  onOpenItem: (item: Item) => void;
  onAddItem: (group: string, branch: BranchKey) => void;
  onEditGroup: (groupId: string) => void;
}) {
  const { group, branches } = entry;
  const [tab, setTab] = useState<BranchKey>(group.selected ?? group.branches[0]?.key ?? "A");
  const steps = branches.get(tab) ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  let n = 1;

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const to = steps.findIndex((x) => x.id === e.over!.id);
    void attempt(() => reorderRecords("items", reorder(steps, String(e.active.id), to)));
  }

  return (
    <div className="e-fork">
      <div className="e-fork-head">
        <button className="e-txt" style={{ textAlign: "left" }} onClick={() => onEditGroup(group.id)}>
          <div className="e-title">{group.title}</div>
          <div className="e-meta">갈림길, 플랜 {group.branches.length}개</div>
        </button>
        {handle}
      </div>
      <div className="seg" role="tablist">
        {group.branches.map((b) => (
          <button key={b.key} role="tab" aria-selected={b.key === tab} onClick={() => setTab(b.key)}>플랜 {b.key}</button>
        ))}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="e-sub">
            {steps.map((it) => {
              const num = it.place ? n++ : null;
              return (
                <SortableRow key={it.id} id={it.id} label={it.title} className="e-step">
                  {(h) => (
                    <>
                      {num !== null ? <span className="p-mk">{num}</span> : <span className="p-mk dot" />}
                      <div className="e-txt">
                        <button className="e-title" style={{ textAlign: "left", width: "100%" }} onClick={() => onOpenItem(it)}>{it.title}</button>
                        {metaOf(it).length > 0 && <div className="e-meta">{metaOf(it).map((m) => <span key={m}>{m}</span>)}</div>}
                        {it.memo && <MemoToggle memo={it.memo} />}
                      </div>
                      {h}
                    </>
                  )}
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <button className="e-add" onClick={() => onAddItem(group.id, tab)}><Plus className="icon" />플랜 {tab}에 일정 추가</button>
    </div>
  );
}
