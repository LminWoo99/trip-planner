import catalog from "./clothing-catalog.json";

// Clothes and hair are described by a few drawable features, not by a fixed list of kinds.
// The catalog (data) gives each kind its default features and the words people use for it;
// modifiers in the text ("반팔", "크롭", "후드", "체크"…) adjust them; the AI can return features directly.

export type Slot = "outer" | "top" | "bottom" | "dress" | "shoes" | "hat" | "acc";
export type Sleeve = "none" | "short" | "long";
export type Length = "crop" | "waist" | "hip" | "thigh" | "knee" | "ankle";
export type Fit = "slim" | "regular" | "wide";
export type Neck = "crew" | "v" | "collar" | "turtle" | "hood";
export type Closure = "none" | "zip" | "buttons" | "open";
export type Texture = "plain" | "quilted" | "rib" | "denim" | "fleece" | "leather";
export type Pattern = "none" | "stripe" | "check" | "dot" | "floral";

export interface Features {
  readonly sleeve?: Sleeve;
  readonly length?: Length;
  readonly fit?: Fit;
  readonly neck?: Neck;
  readonly closure?: Closure;
  readonly texture?: Texture;
  readonly pattern?: Pattern;
  readonly shape?: "pants" | "skirt";
  readonly detail?: "none" | "cargo" | "cuff" | "crease";
  readonly belt?: boolean;
  /** shoes: sneaker, runner, boot, trek, sandal, slipper, loafer, clog, heel; hat: cap, beanie, bucket; acc: scarf, crossbag, backpack, sunglasses */
  readonly style?: string;
}

export interface Garment extends Features {
  readonly text: string;
  readonly slot: Slot | null; // null: not understood yet
  readonly kind: string;
  readonly label: string;
  readonly color: string;
  readonly colorName: string;
  readonly packed: boolean;
}

interface CatalogEntry { id: string; slot: Slot; label: string; attrs: Features; keywords: string[] }
export const CATALOG = catalog as CatalogEntry[];

/** What a drawing was made from; the server stores the same string, so a mismatch means the clothes changed. */
export const renderKey = (items: readonly Garment[]): string =>
  items.filter((g) => g.text).map((g) => g.text.slice(0, 60)).slice(0, 12).join("\n");

export const SLOT_LABEL: Record<Slot, string> = { outer: "겉옷", top: "상의", bottom: "하의", dress: "원피스", shoes: "신발", hat: "모자", acc: "소품" };

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
  [["회색", "그레이", "차콜"], "#9ba0a7", "회색"],
  [["카키", "올리브"], "#6c6d47", "카키"],
  [["갈색", "브라운", "카멜"], "#8a5e3c", "갈색"],
  [["빨간", "빨강", "레드", "버건디"], "#c9473f", "빨강"],
  [["분홍", "핑크"], "#eaa7bb", "분홍"],
  [["초록", "그린", "민트"], "#3f8a5c", "초록"],
  [["노랑", "노란", "옐로", "머스타드"], "#e9c34a", "노랑"],
  [["보라", "퍼플", "라벤더"], "#8a78c9", "보라"],
  [["주황", "오렌지"], "#e48a3c", "주황"],
];

export const DEFAULT_COLOR: Record<Slot, string> = { outer: "#4a5568", top: "#f4f4f1", bottom: "#33507e", dress: "#d6c3a2", shoes: "#f4f4f1", hat: "#25272c", acc: "#25272c" };

/** Words that change a feature whatever the kind is. Checked after the kind is found. */
const MODIFIERS: readonly [RegExp, Partial<Features>, Slot[]?][] = [
  [/반팔|숏슬리브/, { sleeve: "short" }, ["top", "dress", "outer"]],
  [/긴팔|롱슬리브/, { sleeve: "long" }, ["top", "dress", "outer"]],
  [/민소매|나시|슬리브리스/, { sleeve: "none" }, ["top", "dress"]],
  [/크롭/, { length: "crop" }, ["top", "outer"]],
  [/롱(?!슬리브)/, { length: "knee" }, ["outer"]],
  [/와이드|오버핏|오버사이즈|빅사이즈/, { fit: "wide" }],
  [/슬림|스키니|타이트/, { fit: "slim" }],
  [/후드|후디/, { neck: "hood" }, ["top", "outer"]],
  [/카라|칼라|폴로/, { neck: "collar" }, ["top", "outer", "dress"]],
  [/브이넥|v넥/i, { neck: "v" }, ["top", "dress"]],
  [/터틀|폴라|목폴라/, { neck: "turtle" }, ["top", "dress"]],
  [/집업|지퍼/, { closure: "zip" }, ["top", "outer"]],
  [/누빔|퀼팅/, { texture: "quilted" }],
  [/데님|청(?!록)/, { texture: "denim" }, ["outer", "bottom", "top", "dress"]],
  [/가죽|레더/, { texture: "leather" }],
  [/뽀글|플리스|후리스|보아/, { texture: "fleece" }],
  [/체크|깅엄|타탄/, { pattern: "check" }],
  [/스트라이프|줄무늬|단가라/, { pattern: "stripe" }],
  [/도트|땡땡이|물방울/, { pattern: "dot" }],
  [/꽃무늬|플로럴/, { pattern: "floral" }],
];

export function parseGarment(line: string, packed = false): Garment | null {
  const text = line.trim();
  if (!text) return null;
  const t = text.replace(/\s+/g, "");
  let best: { e: CatalogEntry; k: string } | null = null;
  for (const e of CATALOG) for (const k of e.keywords) if (t.includes(k) && (!best || k.length > best.k.length)) best = { e, k };
  const co = COLORS.find(([ks]) => ks.some((k) => t.includes(k)));
  if (!best) return { text, slot: null, kind: "", label: "", color: co?.[1] ?? "#9ba0a7", colorName: co?.[2] ?? "", packed };
  const { e } = best;
  let f: Features = { ...e.attrs };
  for (const [re, patch, slots] of MODIFIERS) if (re.test(t) && (!slots || slots.includes(e.slot))) f = { ...f, ...patch };
  // "청" also names a color for denim
  const color = co ? co[1] : f.texture === "denim" && e.slot === "bottom" ? "#4a6fa5" : DEFAULT_COLOR[e.slot];
  return { ...f, text, slot: e.slot, kind: e.id, label: e.label, color, colorName: co ? co[2] : "기본색", packed };
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

// ---- hair: also features, with named presets people pick from ----

export interface Hair {
  /** forehead: full fringe, short crop, comma, centre part, side part, swept up, long side (leaf), none */
  readonly front: "full" | "crop" | "comma" | "curtain" | "side" | "up" | "leaf" | "none";
  readonly sides: "shaved" | "normal" | "long";
  readonly back: "short" | "neck" | "shoulder" | "chest" | "long";
  readonly curl: "none" | "wave" | "curly" | "c";
  readonly volume: "flat" | "mid" | "high";
  readonly tie: "none" | "pony" | "bun" | "half";
  readonly layered?: boolean;
}

export const HAIR_PRESETS: Record<string, { label: string; for: "m" | "f"; hair: Hair }> = {
  dandy: { label: "댄디컷", for: "m", hair: { front: "full", sides: "normal", back: "short", curl: "none", volume: "mid", tie: "none" } },
  twoblock: { label: "투블럭", for: "m", hair: { front: "full", sides: "shaved", back: "short", curl: "none", volume: "mid", tie: "none" } },
  comma: { label: "쉼표머리", for: "m", hair: { front: "comma", sides: "shaved", back: "short", curl: "none", volume: "mid", tie: "none" } },
  partperm: { label: "가르마펌", for: "m", hair: { front: "curtain", sides: "normal", back: "short", curl: "wave", volume: "high", tie: "none" } },
  leaf: { label: "리프컷", for: "m", hair: { front: "leaf", sides: "normal", back: "neck", curl: "none", volume: "mid", tie: "none" } },
  azperm: { label: "애즈펌", for: "m", hair: { front: "side", sides: "shaved", back: "short", curl: "wave", volume: "high", tie: "none" } },
  crop: { label: "크롭컷", for: "m", hair: { front: "crop", sides: "shaved", back: "short", curl: "none", volume: "flat", tie: "none" } },
  pomade: { label: "포마드", for: "m", hair: { front: "up", sides: "shaved", back: "short", curl: "none", volume: "high", tie: "none" } },
  wolf: { label: "장발·울프컷", for: "m", hair: { front: "side", sides: "long", back: "shoulder", curl: "none", volume: "mid", tie: "none", layered: true } },
  hippie_m: { label: "짧은 히피펌", for: "m", hair: { front: "full", sides: "normal", back: "neck", curl: "curly", volume: "high", tie: "none" } },
  tassel: { label: "태슬컷", for: "f", hair: { front: "side", sides: "long", back: "neck", curl: "none", volume: "flat", tie: "none" } },
  cbob: { label: "C컬 단발", for: "f", hair: { front: "curtain", sides: "long", back: "neck", curl: "c", volume: "mid", tie: "none" } },
  hush: { label: "허쉬컷", for: "f", hair: { front: "curtain", sides: "long", back: "shoulder", curl: "none", volume: "mid", tie: "none", layered: true } },
  layered: { label: "레이어드컷", for: "f", hair: { front: "curtain", sides: "long", back: "chest", curl: "c", volume: "mid", tie: "none", layered: true } },
  straight: { label: "긴 생머리", for: "f", hair: { front: "side", sides: "long", back: "long", curl: "none", volume: "flat", tie: "none" } },
  build: { label: "빌드펌", for: "f", hair: { front: "curtain", sides: "long", back: "chest", curl: "wave", volume: "mid", tie: "none" } },
  hippie_f: { label: "히피펌", for: "f", hair: { front: "full", sides: "long", back: "shoulder", curl: "curly", volume: "high", tie: "none" } },
  pony: { label: "포니테일", for: "f", hair: { front: "side", sides: "normal", back: "short", curl: "none", volume: "flat", tie: "pony" } },
  bun: { label: "똥머리", for: "f", hair: { front: "none", sides: "normal", back: "short", curl: "none", volume: "flat", tie: "bun" } },
  half: { label: "반묶음", for: "f", hair: { front: "curtain", sides: "long", back: "chest", curl: "none", volume: "mid", tie: "half" } },
};

export interface Look {
  readonly body: "m" | "f";
  readonly build: "slim" | "avg" | "broad";
  /** cm; drawn so two people standing together show the difference */
  readonly height: number;
  readonly hairStyle: string; // a HAIR_PRESETS key
  readonly hairColor: string;
  readonly skin: string;
  readonly glasses: "" | "round" | "square";
}

export const DEFAULT_LOOK: Record<Look["body"], Look> = {
  m: { body: "m", build: "avg", height: 175, hairStyle: "dandy", hairColor: "#1f1b1a", skin: "#f1cfb5", glasses: "" },
  f: { body: "f", build: "avg", height: 162, hairStyle: "straight", hairColor: "#2a2220", skin: "#f3d3bd", glasses: "" },
};

/** Older saved looks (before height and hair presets) still draw. */
export function normalizeLook(raw: Partial<Look> & { hair?: string } | null | undefined): Look | null {
  if (!raw) return null;
  const body = raw.body === "f" ? "f" : "m";
  const legacy: Record<string, string> = { short: "dandy", bob: "cbob", long: "straight", tied: "bun" };
  const hairStyle = raw.hairStyle && HAIR_PRESETS[raw.hairStyle] ? raw.hairStyle : legacy[raw.hair ?? ""] ?? DEFAULT_LOOK[body].hairStyle;
  return {
    ...DEFAULT_LOOK[body],
    ...raw,
    body,
    hairStyle,
    height: Math.max(140, Math.min(200, Number(raw.height) || DEFAULT_LOOK[body].height)),
    glasses: raw.glasses === "round" || raw.glasses === "square" ? raw.glasses : "",
  };
}
