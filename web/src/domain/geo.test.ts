import { describe, expect, it } from "vitest";
import { pickLegMode } from "./geo";

const t = (minutes: number) => ({ minutes, meters: minutes * 300 });

describe("pickLegMode", () => {
  it("걸어서 20분 안이면 도보로 보여준다", () => {
    // when
    const r = pickLegMode({ walk: t(12), transit: t(10), car: t(5) });
    // then
    expect(r?.mode).toBe("walk");
  });

  it("대중교통이 차보다 1.5배 이내면 대중교통으로 보여준다", () => {
    // when
    const r = pickLegMode({ walk: t(60), transit: t(20), car: t(15) });
    // then
    expect(r).toEqual({ mode: "transit", time: t(20) });
  });

  it("대중교통이 너무 느리면 차로 보여준다", () => {
    // when
    const r = pickLegMode({ walk: t(60), transit: t(45), car: t(15) });
    // then
    expect(r?.mode).toBe("car");
  });

  it("대중교통 경로가 없는 지역이면 차로 보여준다", () => {
    // when
    const r = pickLegMode({ walk: t(70), transit: null, car: t(15) });
    // then
    expect(r).toEqual({ mode: "car", time: t(15) });
  });

  it("아무 결과도 없으면 null이다", () => {
    // when / then
    expect(pickLegMode({})).toBeNull();
  });
});
