// Clothes written as plain text ("네이비 바람막이") → what the avatar wears.
// A word list covers the common cases offline; anything else can be asked to the AI.

export type Slot = "outer" | "top" | "bottom" | "dress" | "shoes" | "hat";

export interface Garment {
  readonly text: string;
  readonly slot: Slot | null; // null: not understood yet
  readonly type: string;
  readonly label: string;
  readonly color: string;
  readonly colorName: string;
  readonly packed: boolean;
}

export interface Look {
  readonly body: "m" | "f";
  readonly build: "slim" | "avg" | "broad";
  readonly hair: "short" | "bob" | "long" | "tied";
  readonly hairColor: string;
  readonly skin: string;
}

export const SLOT_LABEL: Record<Slot, string> = { outer: "겉옷", top: "상의", bottom: "하의", dress: "원피스", shoes: "신발", hat: "모자" };

const TYPES: readonly [readonly string[], Slot, string, string][] = [
  [["경량패딩"], "outer", "lightpad", "경량 패딩"],
  [["롱패딩", "패딩", "다운"], "outer", "padding", "패딩"],
  [["바람막이", "윈드브레이커", "아노락"], "outer", "wind", "바람막이"],
  [["코트", "트렌치"], "outer", "coat", "코트"],
  [["자켓", "재킷", "블레이저", "점퍼"], "outer", "jacket", "자켓"],
  [["가디건"], "outer", "cardigan", "가디건"],
  [["후리스", "플리스", "뽀글이"], "outer", "fleece", "플리스"],
  [["원피스", "드레스"], "dress", "dress", "원피스"],
  [["맨투맨", "스웻"], "top", "sweat", "맨투맨"],
  [["후드", "후디"], "top", "hoodie", "후드티"],
  [["니트", "스웨터"], "top", "knit", "니트"],
  // "티셔츠" contains "셔츠": check tees first
  [["반팔", "티셔츠", "티"], "top", "tee", "티셔츠"],
  [["셔츠", "남방", "블라우스"], "top", "shirt", "셔츠"],
  [["긴팔"], "top", "long", "긴팔티"],
  [["청바지", "데님", "진"], "bottom", "jeans", "청바지"],
  [["슬랙스"], "bottom", "slacks", "슬랙스"],
  [["등산바지", "트레킹바지", "카고"], "bottom", "hike", "등산바지"],
  [["레깅스"], "bottom", "leggings", "레깅스"],
  [["반바지", "쇼츠"], "bottom", "shorts", "반바지"],
  [["치마", "스커트"], "bottom", "skirt", "치마"],
  [["바지", "팬츠"], "bottom", "pants", "바지"],
  [["트레킹화", "등산화", "부츠", "워커"], "shoes", "boots", "트레킹화"],
  [["샌들", "슬리퍼", "쪼리"], "shoes", "sandals", "샌들"],
  [["로퍼", "구두"], "shoes", "loafers", "로퍼"],
  [["운동화", "스니커즈", "신발"], "shoes", "sneakers", "운동화"],
  [["비니"], "hat", "beanie", "비니"],
  [["모자", "캡", "버킷"], "hat", "cap", "모자"],
];

/** Every type the avatar can draw, for the AI to choose from. */
export const DRAWABLE: readonly { slot: Slot; type: string; label: string }[] = TYPES.map(([, slot, type, label]) => ({ slot, type, label }));

export const COLORS: readonly [readonly string[], string, string][] = [
  [["네이비", "남색", "곤색"], "#2c3a5e", "네이비"],
  [["연청"], "#8fb0d6", "연청"],
  [["진청", "인디고"], "#33507e", "진청"],
  [["하늘", "스카이"], "#a9c8ea", "하늘"],
  [["파랑", "파란", "블루"], "#3a6fc4", "파랑"],
  [["검정", "검은", "블랙", "까만"], "#25272c", "검정"],
  [["흰", "화이트", "하얀"], "#f4f4f1", "흰색"],
  [["아이보리", "크림"], "#efe8d8", "아이보리"],
  [["베이지"], "#d6c3a2", "베이지"],
  [["회색", "그레이", "회"], "#9ba0a7", "회색"],
  [["카키", "올리브"], "#6c6d47", "카키"],
  [["갈색", "브라운", "카멜"], "#8a5e3c", "갈색"],
  [["빨간", "빨강", "레드"], "#c9473f", "빨강"],
  [["분홍", "핑크"], "#eaa7bb", "분홍"],
  [["초록", "그린"], "#3f8a5c", "초록"],
  [["노랑", "노란", "옐로", "머스타드"], "#e9c34a", "노랑"],
  [["보라", "퍼플", "라벤더"], "#8a78c9", "보라"],
  [["주황", "오렌지"], "#e48a3c", "주황"],
];

export const DEFAULT_COLOR: Record<Slot, string> = { top: "#f4f4f1", bottom: "#33507e", outer: "#4a5568", dress: "#d6c3a2", shoes: "#f4f4f1", hat: "#25272c" };

export function parseGarment(line: string, packed = false): Garment | null {
  const text = line.trim();
  if (!text) return null;
  const t = text.replace(/\s+/g, "");
  const ty = TYPES.find(([ks]) => ks.some((k) => t.includes(k)));
  const co = COLORS.find(([ks]) => ks.some((k) => t.includes(k)));
  if (!ty) return { text, slot: null, type: "", label: "", color: co?.[1] ?? "#9ba0a7", colorName: co?.[2] ?? "", packed };
  const [, slot, type, label] = ty;
  return { text, slot, type, label, color: co ? co[1] : DEFAULT_COLOR[slot], colorName: co ? co[2] : "기본색", packed };
}

/** What is drawn: the last understood piece per slot; a dress replaces top and bottom. */
export function wornBySlot(items: readonly Garment[]): Partial<Record<Slot, Garment>> {
  const o: Partial<Record<Slot, Garment>> = {};
  for (const it of items) if (it.slot) o[it.slot] = it;
  if (o.dress) { delete o.top; delete o.bottom; }
  return o;
}

export function packedCount(items: readonly Garment[]): { packed: number; total: number } {
  return { packed: items.filter((i) => i.packed).length, total: items.length };
}

export const DEFAULT_LOOK: Record<Look["body"], Look> = {
  m: { body: "m", build: "avg", hair: "short", hairColor: "#1f1b1a", skin: "#f1cfb5" },
  f: { body: "f", build: "avg", hair: "long", hairColor: "#1f1b1a", skin: "#f3d3bd" },
};
