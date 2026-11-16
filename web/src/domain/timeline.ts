import type { BranchKey, Group, Item } from "./types";

// How one day is laid out: common items and forks share one order sequence;
// a fork's own items are ordered per branch.

export interface ItemEntry {
  readonly kind: "item";
  readonly item: Item;
}

export interface ForkEntry {
  readonly kind: "fork";
  readonly group: Group;
  /** items of every branch, each list already sorted */
  readonly branches: ReadonlyMap<BranchKey, readonly Item[]>;
}

export type DayEntry = ItemEntry | ForkEntry;

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

export function buildDay(dayId: string, items: readonly Item[], groups: readonly Group[]): DayEntry[] {
  const dayGroups = groups.filter((g) => g.day === dayId);
  const groupIds = new Set(dayGroups.map((g) => g.id));
  const branchItems = new Map<string, Item[]>();
  const common: Item[] = [];

  for (const it of items) {
    if (it.day !== dayId) continue;
    if (it.group && groupIds.has(it.group)) {
      const key = `${it.group}:${it.branch ?? "A"}`;
      const list = branchItems.get(key) ?? [];
      list.push(it);
      branchItems.set(key, list);
    } else {
      common.push(it);
    }
  }

  const entries: { order: number; rank: number; entry: DayEntry }[] = [
    ...common.map((item) => ({ order: item.order, rank: 0, entry: { kind: "item", item } as ItemEntry })),
    ...dayGroups.map((group) => {
      const branches = new Map<BranchKey, readonly Item[]>();
      for (const b of group.branches) {
        branches.set(b.key, [...(branchItems.get(`${group.id}:${b.key}`) ?? [])].sort(byOrder));
      }
      return { order: group.order, rank: 1, entry: { kind: "fork", group, branches } as ForkEntry };
    }),
  ];
  // on equal order an item comes before a fork, so "arrive, then decide" reads naturally
  entries.sort((a, b) => a.order - b.order || a.rank - b.rank);
  return entries.map((e) => e.entry);
}

/** Plans being previewed on forks that are not decided yet (group id → plan). */
export type Preview = ReadonlyMap<string, BranchKey>;

/**
 * The branch that counts for maps, routes and costs: the chosen one; before a choice,
 * the plan being previewed, otherwise the first.
 */
export function effectiveBranch(group: Group, preview?: Preview): BranchKey | null {
  const previewed = preview?.get(group.id);
  const valid = previewed && group.branches.some((b) => b.key === previewed) ? previewed : null;
  return group.selected ?? valid ?? group.branches[0]?.key ?? null;
}

/** Items of the day in visiting order, following the effective branch of every fork. */
export function effectiveItems(entries: readonly DayEntry[], preview?: Preview): Item[] {
  const out: Item[] = [];
  for (const e of entries) {
    if (e.kind === "item") out.push(e.item);
    else {
      const key = effectiveBranch(e.group, preview);
      if (key) out.push(...(e.branches.get(key) ?? []));
    }
  }
  return out;
}

/**
 * New `order` values after moving one entry of a list to a new index.
 * Returns only the entries whose order changed, so callers write the minimum.
 */
export function reorder<T extends { id: string; order: number }>(list: readonly T[], fromId: string, toIndex: number): { id: string; order: number }[] {
  const ids = list.map((x) => x.id);
  const from = ids.indexOf(fromId);
  if (from < 0) return [];
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, fromId);
  const before = new Map(list.map((x) => [x.id, x.order]));
  return ids
    .map((id, i) => ({ id, order: i + 1 }))
    .filter(({ id, order }) => before.get(id) !== order);
}
