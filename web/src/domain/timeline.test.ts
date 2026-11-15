import { describe, expect, it } from "vitest";
import { buildDay, effectiveItems, reorder } from "./timeline";
import type { Group, Item } from "./types";

const item = (over: Partial<Item>): Item => ({
  id: "i", day: "d2", order: 1, time: "", cat: "etc", title: "", place: "", lat: null, lng: null,
  memo: "", cost: 0, cur: null, link: "", done: false, group: null, branch: null, ...over,
});

const group = (over: Partial<Group> = {}): Group => ({
  id: "g", day: "d2", order: 2, title: "판시판 날씨 보고 결정", decideAt: "",
  branches: [
    { key: "A", label: "플랜 A", condition: "날씨 좋음" },
    { key: "B", label: "플랜 B", condition: "날씨 나쁨" },
  ],
  selected: null, selectedBy: null, selectedAt: null, ...over,
});

describe("buildDay", () => {
  it("공통 일정과 갈림길이 order 순서로 섞여 나온다", () => {
    // given
    const items = [item({ id: "c3", order: 3 }), item({ id: "c1", order: 1 })];
    // when
    const entries = buildDay("d2", items, [group({ order: 2 })]);
    // then
    expect(entries.map((e) => (e.kind === "item" ? e.item.id : "fork"))).toEqual(["c1", "fork", "c3"]);
  });

  it("분기 일정은 플랜별로 묶이고 플랜 안에서 order 순서로 정렬된다", () => {
    // given
    const items = [
      item({ id: "a2", group: "g", branch: "A", order: 2 }),
      item({ id: "a1", group: "g", branch: "A", order: 1 }),
      item({ id: "b1", group: "g", branch: "B", order: 1 }),
    ];
    // when
    const [fork] = buildDay("d2", items, [group()]);
    // then
    expect(fork.kind).toBe("fork");
    if (fork.kind !== "fork") return;
    expect(fork.branches.get("A")?.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(fork.branches.get("B")?.map((i) => i.id)).toEqual(["b1"]);
  });

  it("다른 날의 일정은 포함하지 않는다", () => {
    // given
    const items = [item({ id: "x", day: "d3" })];
    // when
    const entries = buildDay("d2", items, []);
    // then
    expect(entries).toEqual([]);
  });

  it("order가 같으면 공통 일정이 갈림길보다 먼저 나온다", () => {
    // given
    const items = [item({ id: "c", order: 2 })];
    // when
    const entries = buildDay("d2", items, [group({ order: 2 })]);
    // then
    expect(entries[0].kind).toBe("item");
  });
});

describe("effectiveItems", () => {
  const items = [
    item({ id: "c1", order: 1 }),
    item({ id: "a1", group: "g", branch: "A", order: 1 }),
    item({ id: "b1", group: "g", branch: "B", order: 1 }),
  ];

  it("선택 전에는 플랜 A 기준으로 일정을 이어 붙인다", () => {
    // given
    const entries = buildDay("d2", items, [group()]);
    // when
    const result = effectiveItems(entries);
    // then
    expect(result.map((i) => i.id)).toEqual(["c1", "a1"]);
  });

  it("선택 후에는 선택한 플랜 기준으로 일정을 이어 붙인다", () => {
    // given
    const entries = buildDay("d2", items, [group({ selected: "B" })]);
    // when
    const result = effectiveItems(entries);
    // then
    expect(result.map((i) => i.id)).toEqual(["c1", "b1"]);
  });
});

describe("reorder", () => {
  const list = [
    { id: "a", order: 1 },
    { id: "b", order: 2 },
    { id: "c", order: 3 },
  ];

  it("맨 뒤 항목을 맨 앞으로 옮기면 바뀐 항목만 새 order를 받는다", () => {
    // when
    const changes = reorder(list, "c", 0);
    // then
    expect(changes).toEqual([
      { id: "c", order: 1 },
      { id: "a", order: 2 },
      { id: "b", order: 3 },
    ]);
  });

  it("제자리로 옮기면 바뀌는 항목이 없다", () => {
    // when
    const changes = reorder(list, "b", 1);
    // then
    expect(changes).toEqual([]);
  });
});
