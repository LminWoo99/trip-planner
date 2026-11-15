// Domain model. Plain readonly data; no dependency on PocketBase or the UI.

export type Currency = "VND" | "KRW" | "USD";
export type BranchKey = "A" | "B" | "C" | "D";
export type Category = "flight" | "move" | "stay" | "food" | "cafe" | "sight" | "trek" | "shop" | "etc";
export type Split = "half" | "payer" | "other";

export interface Trip {
  readonly id: string;
  readonly title: string;
  readonly start: string; // YYYY-MM-DD
  readonly end: string;
  readonly vndKrw: number;
  readonly usdKrw: number;
  readonly budget: number;
}

export interface Member {
  readonly id: string;
  readonly user: string;
  readonly displayName: string;
}

export interface Day {
  readonly id: string;
  readonly n: number;
  readonly date: string; // YYYY-MM-DD
  readonly city: string;
  readonly title: string;
  readonly stay: string;
  readonly memo: string;
}

export interface Branch {
  readonly key: BranchKey;
  readonly label: string;
  readonly condition: string;
  /** knock-on effect on other days, e.g. "3일차에 판시판 재시도" */
  readonly note?: string;
}

export interface Group {
  readonly id: string;
  readonly day: string;
  readonly order: number;
  readonly title: string;
  readonly decideAt: string;
  readonly branches: readonly Branch[];
  readonly selected: BranchKey | null;
  readonly selectedBy: string | null; // member id
  readonly selectedAt: string | null;
}

export interface Item {
  readonly id: string;
  readonly day: string;
  readonly order: number;
  readonly time: string;
  readonly cat: Category;
  readonly title: string;
  readonly place: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly memo: string;
  readonly cost: number;
  readonly cur: Currency | null;
  readonly link: string;
  readonly done: boolean;
  readonly group: string | null;
  readonly branch: BranchKey | null;
}

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly type: string;
  readonly q: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly price: string;
  readonly memo: string;
  readonly link: string;
  readonly visited: boolean;
}

export interface Expense {
  readonly id: string;
  readonly title: string;
  readonly amount: number;
  readonly cur: Currency;
  readonly payer: string; // member id
  readonly split: Split;
  readonly cat: string;
  readonly day: string | null;
  readonly memo: string;
  readonly created: string;
}

export interface ChecklistItem {
  readonly id: string;
  readonly text: string;
  readonly cat: string;
  readonly who: string;
  readonly memo: string;
  readonly done: boolean;
  readonly order: number;
}

export interface Booking {
  readonly id: string;
  readonly type: "flight" | "stay" | "move" | "tour" | "etc";
  readonly title: string;
  readonly when: string;
  readonly code: string;
  readonly memo: string;
  readonly link: string;
}

export interface Note {
  readonly id: string;
  readonly text: string;
}

/** Everything the app shows for one trip. */
export interface TripSnapshot {
  readonly trip: Trip;
  readonly members: readonly Member[];
  readonly days: readonly Day[];
  readonly groups: readonly Group[];
  readonly items: readonly Item[];
  readonly places: readonly Place[];
  readonly expenses: readonly Expense[];
  readonly checklist: readonly ChecklistItem[];
  readonly bookings: readonly Booking[];
  readonly notes: readonly Note[];
}

export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  flight: "항공", move: "이동", stay: "숙소", food: "식사", cafe: "카페",
  sight: "관광", trek: "트레킹", shop: "쇼핑", etc: "기타",
};
