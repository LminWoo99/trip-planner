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

const isSpend = (e: Expense) => e.kind !== "deposit";

/** Everything actually spent (personal and shared wallet), in KRW. Deposits are not spending. */
export function totalSpent(expenses: readonly Expense[], rates: Rates): number {
  return expenses.filter(isSpend).reduce((s, e) => s + toKrw(e.amount, e.cur, rates), 0);
}

export function totalsByCategory(expenses: readonly Expense[], rates: Rates): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses.filter(isSpend)) {
    const key = e.cat || "기타";
    out.set(key, (out.get(key) ?? 0) + toKrw(e.amount, e.cur, rates));
  }
  return out;
}

/** Shared wallet balance per currency: deposits minus what was paid from it. */
export function poolBalance(expenses: readonly Expense[]): Map<Currency, number> {
  const out = new Map<Currency, number>();
  for (const e of expenses) {
    if (e.kind === "deposit") out.set(e.cur, (out.get(e.cur) ?? 0) + e.amount);
    else if (e.fromPool) out.set(e.cur, (out.get(e.cur) ?? 0) - e.amount);
  }
  return out;
}

export function depositsByMember(expenses: readonly Expense[], rates: Rates): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    if (e.kind === "deposit" && e.payer) out.set(e.payer, (out.get(e.payer) ?? 0) + toKrw(e.amount, e.cur, rates));
  }
  return out;
}

export interface Settlement {
  readonly from: Member;
  readonly to: Member;
  readonly amount: number; // KRW, rounded
}

/**
 * Who owes whom, for a two-person trip.
 * Personal payments: half → the other owes half · other → the other owes all · payer → nothing.
 * Shared wallet: spending from it is shared by definition; only unequal deposits matter,
 * and the leftover is assumed split evenly, so the gap is settled by half.
 */
export function settle(expenses: readonly Expense[], members: readonly Member[], rates: Rates): Settlement | null {
  if (members.length !== 2) return null;
  const [a, b] = members;
  let aOwesB = 0;
  for (const e of expenses) {
    const krw = toKrw(e.amount, e.cur, rates);
    if (e.kind === "deposit") {
      if (e.payer === b.id) aOwesB += krw / 2;
      else if (e.payer === a.id) aOwesB -= krw / 2;
      continue;
    }
    if (e.fromPool) continue;
    const share = e.split === "half" ? krw / 2 : e.split === "other" ? krw : 0;
    if (e.payer === b.id) aOwesB += share;
    else if (e.payer === a.id) aOwesB -= share;
  }
  const amount = Math.round(Math.abs(aOwesB));
  if (amount === 0) return null;
  return aOwesB > 0 ? { from: a, to: b, amount } : { from: b, to: a, amount };
}

export interface PlannedCost {
  readonly krw: number;
  /** how many items had a cost; 0 means "unknown", not "free" */
  readonly counted: number;
}

/** Planned cost of schedule items, converted to KRW. */
export function plannedCost(items: readonly { cost: number; cur: Currency | null }[], rates: Rates): PlannedCost {
  let krw = 0;
  let counted = 0;
  for (const it of items) {
    if (!it.cost) continue;
    krw += toKrw(it.cost, it.cur ?? "VND", rates);
    counted++;
  }
  return { krw, counted };
}

/** Money actually spent on one day (personal and shared wallet; deposits excluded). */
export function spentOnDay(expenses: readonly Expense[], dayId: string, rates: Rates): number {
  return expenses.filter((e) => e.kind !== "deposit" && e.day === dayId).reduce((s, e) => s + toKrw(e.amount, e.cur, rates), 0);
}

/** "약 152,000원", rounded to the nearest thousand for planning figures. */
export const formatApproxKrw = (n: number) => `약 ${(Math.round(n / 1000) * 1000).toLocaleString("ko-KR")}원`;

export const formatKrw = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
