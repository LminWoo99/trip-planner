import { describe, expect, it } from "vitest";
import { citiesOf, nightsLabel, sortTrips, tripStatus } from "./trips";

const sapa = { start: "2026-12-02", end: "2026-12-06" };

describe("tripStatus", () => {
  it("출발 전에는 남은 날을 D-day로 센다", () => {
    expect(tripStatus(sapa, "2026-11-16")).toEqual({ kind: "upcoming", dday: 16 });
  });

  it("여행 중에는 오늘이 며칠째인지 센다", () => {
    expect(tripStatus(sapa, "2026-12-03")).toEqual({ kind: "ongoing", dayN: 2 });
  });

  it("마지막 날까지는 여행 중이고 다음 날부터 다녀온 여행이다", () => {
    expect(tripStatus(sapa, "2026-12-06")).toEqual({ kind: "ongoing", dayN: 5 });
    expect(tripStatus(sapa, "2026-12-07")).toEqual({ kind: "past" });
  });
});

describe("nightsLabel", () => {
  it("박과 일을 센다", () => {
    expect(nightsLabel(sapa)).toBe("4박 5일");
  });

  it("하루짜리는 당일치기다", () => {
    expect(nightsLabel({ start: "2027-01-01", end: "2027-01-01" })).toBe("당일치기");
  });
});

describe("sortTrips", () => {
  it("다가오는 여행은 빠른 순, 다녀온 여행은 최근 순으로 나눈다", () => {
    // given
    const trips = [
      { id: "tokyo", start: "2027-03-20", end: "2027-03-23" },
      { id: "danang", start: "2025-03-14", end: "2025-03-17" },
      { id: "sapa", ...sapa },
      { id: "osaka", start: "2025-10-01", end: "2025-10-03" },
    ];
    // when
    const { coming, past } = sortTrips(trips, "2026-11-16");
    // then
    expect(coming.map((t) => t.id)).toEqual(["sapa", "tokyo"]);
    expect(past.map((t) => t.id)).toEqual(["osaka", "danang"]);
  });
});

describe("citiesOf", () => {
  it("날짜별 도시에서 중복 없이 처음 나온 순서대로 뽑는다", () => {
    expect(citiesOf(["인천 → 하노이 → 사파", "사파", "사파 → 하노이"])).toEqual(["인천", "하노이", "사파"]);
  });
});
