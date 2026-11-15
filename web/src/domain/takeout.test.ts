import { describe, expect, it } from "vitest";
import { parseTakeoutCsv } from "./takeout";

describe("parseTakeoutCsv", () => {
  it("구글 테이크아웃 저장 목록에서 이름과 메모를 읽는다", () => {
    // given
    const csv = 'Title,Note,URL,Comment\nMoana Sapa,그네 사진,https://maps.google.com/?cid=1,\n"Cong Caphe, Sapa",,https://maps.google.com/?cid=2,\n';
    // when
    const rows = parseTakeoutCsv(csv);
    // then
    expect(rows).toEqual([
      { name: "Moana Sapa", note: "그네 사진" },
      { name: "Cong Caphe, Sapa", note: "" },
    ]);
  });

  it("따옴표 안의 줄바꿈과 이스케이프된 따옴표를 유지한다", () => {
    // given
    const csv = 'Title,Note\r\n"Hill ""Station""","첫 줄\n둘째 줄"\r\n';
    // when
    const rows = parseTakeoutCsv(csv);
    // then
    expect(rows).toEqual([{ name: 'Hill "Station"', note: "첫 줄\n둘째 줄" }]);
  });

  it("이름이 빈 줄은 건너뛴다", () => {
    expect(parseTakeoutCsv("Title,Note\n,메모만\n")).toEqual([]);
  });
});
