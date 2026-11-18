import { describe, expect, it } from "vitest";
import { linkHost, withScheme } from "./links";

describe("linkHost", () => {
  it("붙여 넣은 예보 주소에서 www를 뺀 사이트 이름을 보여준다", () => {
    // given
    const url = "https://www.mountain-forecast.com/peaks/Fan-Si-Pan/forecasts/3211";

    // when
    const host = linkHost(url);

    // then
    expect(host).toBe("mountain-forecast.com");
  });

  it("주소가 아닌 글이면 빈 값을 돌려준다", () => {
    // given
    const text = "판시판 날씨";

    // when
    const host = linkHost(text);

    // then
    expect(host).toBe("");
  });
});

describe("withScheme", () => {
  it("https 없이 붙여 넣은 주소에 https를 붙인다", () => {
    // given
    const raw = "www.mountain-forecast.com/peaks/Fan-Si-Pan";

    // when
    const url = withScheme(raw);

    // then
    expect(url).toBe("https://www.mountain-forecast.com/peaks/Fan-Si-Pan");
  });
});
