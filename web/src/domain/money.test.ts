import { describe, expect, it } from "vitest";
import { settle, toKrw, totalsByCategory } from "./money";
import type { Expense, Member } from "./types";

const rates = { vndKrw: 0.053, usdKrw: 1395 };
const minu: Member = { id: "m1", user: "u1", displayName: "민우" };
const ryeojin: Member = { id: "m2", user: "u2", displayName: "려진" };

const expense = (over: Partial<Expense>): Expense => ({
  id: "e", title: "", amount: 0, cur: "KRW", payer: minu.id, split: "half", cat: "식비", day: null, memo: "", created: "", ...over,
});

describe("toKrw", () => {
  it("동을 설정된 환율로 원화 환산한다", () => {
    expect(toKrw(100_000, "VND", rates)).toBeCloseTo(5_300);
  });

  it("달러를 설정된 환율로 원화 환산한다", () => {
    expect(toKrw(10, "USD", rates)).toBe(13_950);
  });
});

describe("settle", () => {
  it("반반 결제는 상대가 결제자에게 절반을 보낸다", () => {
    // given
    const expenses = [expense({ amount: 20_000, payer: minu.id, split: "half" })];
    // when
    const result = settle(expenses, [minu, ryeojin], rates);
    // then
    expect(result).toEqual({ from: ryeojin, to: minu, amount: 10_000 });
  });

  it("상대 것 대신 결제하면 상대가 전액을 보낸다", () => {
    // given
    const expenses = [expense({ amount: 15_000, payer: ryeojin.id, split: "other" })];
    // when
    const result = settle(expenses, [minu, ryeojin], rates);
    // then
    expect(result).toEqual({ from: minu, to: ryeojin, amount: 15_000 });
  });

  it("낸 사람 것은 정산하지 않는다", () => {
    // given
    const expenses = [expense({ amount: 50_000, split: "payer" })];
    // when
    const result = settle(expenses, [minu, ryeojin], rates);
    // then
    expect(result).toBeNull();
  });

  it("서로 낸 금액이 상쇄되면 차액만 보낸다", () => {
    // given
    const expenses = [
      expense({ amount: 40_000, payer: minu.id, split: "half" }),
      expense({ amount: 100_000, cur: "VND", payer: ryeojin.id, split: "half" }),
    ];
    // when
    const result = settle(expenses, [minu, ryeojin], rates);
    // then  20,000 - 2,650 = 17,350
    expect(result).toEqual({ from: ryeojin, to: minu, amount: 17_350 });
  });
});

describe("totalsByCategory", () => {
  it("분류별로 원화 합계를 낸다", () => {
    // given
    const expenses = [
      expense({ amount: 10_000, cat: "식비" }),
      expense({ amount: 2, cur: "USD", cat: "식비" }),
      expense({ amount: 5_000, cat: "교통" }),
    ];
    // when
    const totals = totalsByCategory(expenses, rates);
    // then
    expect(totals.get("식비")).toBe(12_790);
    expect(totals.get("교통")).toBe(5_000);
  });
});
