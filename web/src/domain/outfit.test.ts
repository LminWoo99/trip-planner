import { describe, expect, it } from "vitest";
import { packedCount, parseGarment, wornBySlot } from "./outfit";

describe("parseGarment", () => {
  it("색과 종류를 글자에서 알아낸다", () => {
    // when
    const g = parseGarment("네이비 바람막이");
    // then
    expect(g).toMatchObject({ slot: "outer", type: "wind", colorName: "네이비" });
  });

  it("경량 패딩은 띄어 써도 패딩이 아니라 경량 패딩이다", () => {
    // when / then
    expect(parseGarment("하늘 경량 패딩")?.type).toBe("lightpad");
  });

  it("색이 없으면 종류별 기본색을 쓴다", () => {
    // when
    const g = parseGarment("트레킹화");
    // then
    expect(g).toMatchObject({ slot: "shoes", colorName: "기본색" });
  });

  it("티셔츠는 셔츠가 아니라 티셔츠다", () => {
    // when / then
    expect(parseGarment("흰 티셔츠")?.type).toBe("tee");
    expect(parseGarment("체크 셔츠")?.type).toBe("shirt");
  });

  it("모르는 말은 종류 없이 남겨 둔다", () => {
    // when / then
    expect(parseGarment("아빠 옷")?.slot).toBeNull();
  });

  it("빈 줄은 무시한다", () => {
    // when / then
    expect(parseGarment("   ")).toBeNull();
  });
});

describe("wornBySlot", () => {
  it("원피스를 입으면 상의와 하의는 그리지 않는다", () => {
    // given
    const items = ["흰 티셔츠", "청바지", "베이지 원피스"].map((l) => parseGarment(l)!);
    // when
    const worn = wornBySlot(items);
    // then
    expect(Object.keys(worn)).toEqual(["dress"]);
  });
});

describe("packedCount", () => {
  it("챙긴 옷 수를 센다", () => {
    // given
    const items = [parseGarment("니트", true)!, parseGarment("바지")!];
    // when / then
    expect(packedCount(items)).toEqual({ packed: 1, total: 2 });
  });
});
