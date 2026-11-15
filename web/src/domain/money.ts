import type { Currency, Expense, Member } from "./types";

export interface Rates {
  readonly vndKrw: number;
  readonly usdKrw: number;
}

export function toKrw(amount: number, cur: Currency, rates: Rates): number {
  switch (cur) {
    case "KRW": return amount;
    case "VND": return amount * rates.vndKrw;
    case "USD": return amount * rates.usdKrw;
  }
}

export interface Settlement {
  readonly from: Member;
  readonly to: Member;
  readonly amount: number; // KRW, rounded
}

/**
 * Who owes whom, for a two-person trip.
 * half  → the other person owes the payer half
 * other → the payer paid for the other person, who owes it all
 * payer → the payer's own expense, nothing owed
 */
export function settle(expenses: readonly Expense[], members: readonly Member[], rates: Rates): Settlement | null {
  if (members.length !== 2) return null;
  const [a, b] = members;
  let aOwesB = 0;
  for (const e of expenses) {
    const krw = toKrw(e.amount, e.cur, rates);
    const share = e.split === "half" ? krw / 2 : e.split === "other" ? krw : 0;
    if (e.payer === b.id) aOwesB += share;
    else if (e.payer === a.id) aOwesB -= share;
  }
  const amount = Math.round(Math.abs(aOwesB));
  if (amount === 0) return null;
  return aOwesB > 0 ? { from: a, to: b, amount } : { from: b, to: a, amount };
}

export function totalsByCategory(expenses: readonly Expense[], rates: Rates): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    const key = e.cat || "기타";
    out.set(key, (out.get(key) ?? 0) + toKrw(e.amount, e.cur, rates));
  }
  return out;
}

export const formatKrw = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
