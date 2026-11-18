import { describe, expect, it } from "vitest";
import { currenciesFor, formatMoney } from "./countries";

describe("formatMoney", () => {
  it("엔은 기호를 앞에, 동과 원은 뒤에 붙인다", () => {
    // given / when
    const texts = [formatMoney(2400, "JPY"), formatMoney(100000, "VND"), formatMoney(22000, "KRW")];

    // then
    expect(texts).toEqual(["¥2,400", "100,000₫", "22,000원"]);
  });
});

describe("currenciesFor", () => {
  it("국내 여행은 원만 고를 수 있다", () => {
    // given
    const trip = { region: "domestic" as const, currency: "KRW" };

    // when
    const list = currenciesFor(trip);

    // then
    expect(list).toEqual(["KRW"]);
  });

  it("해외 여행은 그 나라 돈을 먼저, 원과 달러를 뒤에 보여준다", () => {
    // given
    const trip = { region: "abroad" as const, currency: "JPY" };

    // when
    const list = currenciesFor(trip);

    // then
    expect(list).toEqual(["JPY", "KRW", "USD"]);
  });
});
