import { describe, expect, it } from "vitest";
import { CATALOG, HAIR_PRESETS, normalizeLook, packedCount, parseGarment, wornBySlot } from "./wardrobe";

describe("parseGarment", () => {
  it("종류의 기본 특징에 색을 더한다", () => {
    // when
    const g = parseGarment("네이비 바람막이");
    // then
    expect(g).toMatchObject({ slot: "outer", kind: "windbreaker", colorName: "네이비", sleeve: "long", closure: "zip" });
  });

  it("더 긴 표현이 이긴다: 경량 패딩은 패딩이 아니라 경량패딩이다", () => {
    // when / then
    expect(parseGarment("하늘 경량 패딩")?.kind).toBe("lightpad");
  });

  it("브랜드와 줄임말도 알아듣는다", () => {
    // when / then
    expect(parseGarment("노스페이스 눕시")?.kind).toBe("padding_short");
    expect(parseGarment("회색 뉴발")?.slot).toBe("shoes");
    expect(parseGarment("크록스")?.kind).toBe("clogs");
  });

  it("티셔츠는 셔츠가 아니라 티셔츠다", () => {
    // when / then
    expect(parseGarment("흰 티셔츠")?.kind).toBe("tee");
    expect(parseGarment("체크 셔츠")?.kind).toBe("shirt");
  });

  it("후드, 무늬, 기장 같은 말이 특징을 바꾼다", () => {
    // when
    const pad = parseGarment("검정 후드 경량 패딩");
    const shirt = parseGarment("체크 반팔 셔츠");
    // then
    expect(pad).toMatchObject({ kind: "lightpad", neck: "hood" });
    expect(shirt).toMatchObject({ kind: "shirt", pattern: "check", sleeve: "short" });
  });

  it("모르는 말은 종류 없이 남겨 둔다", () => {
    // when / then
    expect(parseGarment("아빠 옷")?.slot).toBeNull();
  });
});

describe("catalog", () => {
  it("모든 종류에 표현이 있고 같은 id가 두 번 나오지 않는다", () => {
    // when
    const ids = CATALOG.map((c) => c.id);
    // then
    expect(new Set(ids).size).toBe(ids.length);
    expect(CATALOG.every((c) => c.keywords.length > 0)).toBe(true);
  });
});

describe("wornBySlot", () => {
  it("원피스를 입으면 상의와 하의는 그리지 않는다", () => {
    // given
    const items = ["흰 티셔츠", "청바지", "베이지 롱원피스"].map((l) => parseGarment(l)!);
    // when / then
    expect(Object.keys(wornBySlot(items))).toEqual(["dress"]);
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

describe("normalizeLook", () => {
  it("예전에 저장한 아바타도 새 머리 스타일과 기본 키로 읽는다", () => {
    // when
    const look = normalizeLook({ body: "f", build: "slim", hair: "long", hairColor: "#3b2a22", skin: "#f3d3bd" });
    // then
    expect(look).toMatchObject({ hairStyle: "straight", height: 162, glasses: "" });
    expect(HAIR_PRESETS[look!.hairStyle]).toBeDefined();
  });
});
