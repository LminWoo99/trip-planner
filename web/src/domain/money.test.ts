import { describe, expect, it } from "vitest";
import { poolBalance, settle, toKrw, totalSpent, totalsByCategory } from "./money";
import type { Expense, Member } from "./types";

const rates = { vndKrw: 0.053, usdKrw: 1395 };
const minu: Member = { id: "m1", user: "u1", displayName: "민우" };
const ryeojin: Member = { id: "m2", user: "u2", displayName: "려진" };

const expense = (over: Partial<Expense>): Expense => ({
  id: "e", kind: "spend", title: "", amount: 0, cur: "KRW", payer: minu.id, fromPool: false, split: "half", cat: "식비", day: null, memo: "", created: "", ...over,
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

describe("공용비", () => {
  const deposit = (payer: string, amount: number) => expense({ kind: "deposit", payer, amount, cur: "VND" });

  it("잔액은 통화별로 넣은 돈에서 공용비로 쓴 돈을 뺀다", () => {
    // given
    const expenses = [deposit(minu.id, 1_000_000), deposit(ryeojin.id, 1_000_000), expense({ fromPool: true, payer: null, amount: 300_000, cur: "VND" })];
    // when
    const balance = poolBalance(expenses);
    // then
    expect(balance.get("VND")).toBe(1_700_000);
  });

  it("공용비 입금은 총 지출에 들어가지 않고 공용비로 쓴 돈은 들어간다", () => {
    // given
    const expenses = [deposit(minu.id, 1_000_000), expense({ fromPool: true, payer: null, amount: 100_000, cur: "VND" })];
    // when
    const total = totalSpent(expenses, rates);
    // then
    expect(total).toBeCloseTo(5_300);
  });

  it("같은 금액을 넣고 공용비로만 쓰면 정산할 돈이 없다", () => {
    // given
    const expenses = [deposit(minu.id, 1_000_000), deposit(ryeojin.id, 1_000_000), expense({ fromPool: true, payer: null, amount: 500_000, cur: "VND" })];
    // when
    const result = settle(expenses, [minu, ryeojin], rates);
    // then
    expect(result).toBeNull();
  });

  it("넣은 금액이 다르면 차액의 절반을 정산한다", () => {
    // given  2,000,000₫ vs 1,000,000₫ → gap 53,000원, half 26,500원
    const expenses = [deposit(minu.id, 2_000_000), deposit(ryeojin.id, 1_000_000)];
    // when
    const result = settle(expenses, [minu, ryeojin], rates);
    // then
    expect(result).toEqual({ from: ryeojin, to: minu, amount: 26_500 });
  });
});
