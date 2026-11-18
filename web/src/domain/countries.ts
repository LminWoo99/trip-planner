// Countries a trip can be to, with the money used there. Domestic trips use KRW only.

export interface Country {
  readonly code: string;
  readonly name: string;
  /** ISO 4217 */
  readonly currency: string;
  /** shown before the amount ("¥2,400"), or after it when suffix is set ("2,400₫") */
  readonly sign: string;
  readonly suffix?: boolean;
  /** what the money is called ("엔") */
  readonly money: string;
  /** rough won per unit, used only when today's rate can't be fetched */
  readonly approxKrw: number;
}

export const COUNTRIES: readonly Country[] = [
  { code: "VN", name: "베트남", currency: "VND", sign: "₫", suffix: true, money: "동", approxKrw: 0.053 },
  { code: "JP", name: "일본", currency: "JPY", sign: "¥", money: "엔", approxKrw: 9.2 },
  { code: "TH", name: "태국", currency: "THB", sign: "฿", money: "바트", approxKrw: 40 },
  { code: "TW", name: "대만", currency: "TWD", sign: "NT$", money: "대만 달러", approxKrw: 44 },
  { code: "US", name: "미국", currency: "USD", sign: "$", money: "달러", approxKrw: 1395 },
  { code: "CN", name: "중국", currency: "CNY", sign: "元", suffix: true, money: "위안", approxKrw: 195 },
  { code: "HK", name: "홍콩", currency: "HKD", sign: "HK$", money: "홍콩 달러", approxKrw: 179 },
  { code: "SG", name: "싱가포르", currency: "SGD", sign: "S$", money: "싱가포르 달러", approxKrw: 1070 },
  { code: "PH", name: "필리핀", currency: "PHP", sign: "₱", money: "페소", approxKrw: 24 },
  { code: "ID", name: "인도네시아", currency: "IDR", sign: "Rp", money: "루피아", approxKrw: 0.086 },
  { code: "MY", name: "말레이시아", currency: "MYR", sign: "RM", money: "링깃", approxKrw: 315 },
  { code: "LA", name: "라오스", currency: "LAK", sign: "₭", suffix: true, money: "킵", approxKrw: 0.064 },
  { code: "EU", name: "유럽", currency: "EUR", sign: "€", money: "유로", approxKrw: 1500 },
  { code: "GB", name: "영국", currency: "GBP", sign: "£", money: "파운드", approxKrw: 1800 },
  { code: "AU", name: "호주", currency: "AUD", sign: "A$", money: "호주 달러", approxKrw: 910 },
];

/** shown first when picking a country */
export const POPULAR = ["VN", "JP", "TH", "TW", "US"];

const KRW = { sign: "원", suffix: true, money: "원" } as const;

export function moneyOf(currency: string): { sign: string; suffix: boolean; money: string } {
  if (currency === "KRW") return KRW;
  const c = COUNTRIES.find((x) => x.currency === currency);
  return c ? { sign: c.sign, suffix: !!c.suffix, money: c.money } : { sign: currency + " ", suffix: false, money: currency };
}

/** "¥2,400", "100,000₫", "22,000원" */
export function formatMoney(amount: number, currency: string): string {
  const m = moneyOf(currency);
  const n = Math.round(amount * 100) / 100;
  const text = n.toLocaleString(currency === "USD" || currency === "EUR" || currency === "GBP" ? "en-US" : "ko-KR");
  return m.suffix ? `${text}${m.sign}` : `${m.sign}${text}`;
}

/** Currencies offered when writing down money on a trip: local first, then won and dollars. */
export function currenciesFor(trip: { region: "domestic" | "abroad"; currency: string }): string[] {
  if (trip.region === "domestic") return ["KRW"];
  return [...new Set([trip.currency, "KRW", "USD"])];
}
