import { HAIR_PRESETS, wornBySlot, type Garment, type Hair, type Look, type Slot } from "../../domain/wardrobe";

// Chibi avatar drawn from features: the head keeps its size, the body follows the height,
// and every person stands on the same ground line so height differences show.
// Output is an SVG string; every color is checked to be a hex value before it goes in.

const HEX = /^#[0-9a-f]{6}$/i;
const safe = (c: string | undefined, d: string) => (c && HEX.test(c) ? c : d);
const mix = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

const NECK = 66;
const FEET = 236;
const GROUND = 300;
const LEN_Y: Record<string, number> = { crop: 116, waist: 130, hip: 142, thigh: 168, knee: 192, ankle: 224 };
let seq = 0;

type Worn = Partial<Record<Slot, Garment>>;

function person(look: Look, worn: Worn, x: number) {
  const id = `av${++seq}`;
  const skin = safe(look.skin, "#f3d3bd");
  const hairC = safe(look.hairColor, "#2a2220");
  const f = look.body === "f";
  const wScale = ({ slim: 0.93, avg: 1, broad: 1.1 }[look.build] ?? 1) * (f ? 0.94 : 1);
  const cm = Math.max(140, Math.min(200, look.height || (f ? 162 : 175)));
  const k = (128 + (cm - 150) * 1.7) / (FEET - NECK);
  const defs: string[] = [];
  const body: string[] = [];
  const head: string[] = [];
  const back: string[] = [];
  const st = (c: string) => `stroke="${mix(c, 0.72)}" stroke-width="1.3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"`;
  const path = (arr: string[], d: string, fill: string, base = fill) => arr.push(`<path d="${d}" fill="${fill}" ${st(base)}/>`);
  const line = (arr: string[], d: string, base: string, w = 1.3) => arr.push(`<path d="${d}" fill="none" stroke="${mix(base, 0.68)}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`);
  const W = (v: number) => 80 + (v - 80) * wScale;

  const paint = (g: Garment, fallback: string): { fill: string; base: string } => {
    const base = safe(g.color, fallback);
    const pid = `${id}-${g.slot}`;
    const dark = mix(base, 0.72);
    if (g.pattern === "stripe") defs.push(`<pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${base}"/><rect width="6" height="2" fill="${dark}"/></pattern>`);
    else if (g.pattern === "check") defs.push(`<pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${base}"/><rect width="10" height="3" fill="${dark}" opacity=".5"/><rect width="3" height="10" fill="${dark}" opacity=".5"/></pattern>`);
    else if (g.pattern === "dot") defs.push(`<pattern id="${pid}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${base}"/><circle cx="4" cy="4" r="1.4" fill="${mix(base, 1.35)}"/></pattern>`);
    else if (g.pattern === "floral") defs.push(`<pattern id="${pid}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${base}"/><g fill="${mix(base, 1.4)}"><circle cx="6" cy="4" r="1.6"/><circle cx="4" cy="6" r="1.6"/><circle cx="8" cy="6" r="1.6"/><circle cx="6" cy="8" r="1.6"/></g><circle cx="6" cy="6" r="1.2" fill="#e9c34a"/></pattern>`);
    else if (g.texture === "fleece") defs.push(`<pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${base}"/><circle cx="2.5" cy="2.5" r="1.1" fill="${mix(base, 0.9)}"/></pattern>`);
    else return { fill: base, base };
    return { fill: `url(#${pid})`, base };
  };

  // ---- skin underneath ----
  const gap = 3;
  path(body, `M${W(64)} 150 L${80 - gap} 150 L${79 - gap} 228 L${W(66)} 228 Z`, skin);
  path(body, `M${80 + gap} 150 L${W(96)} 150 L${W(94)} 228 L${81 + gap} 228 Z`, skin);
  path(body, `M${W(56)} 76 Q${W(45)} 110 ${W(43)} 146 L${W(52)} 147 Q${W(55)} 112 ${W(62)} 86 Z`, skin);
  path(body, `M${W(104)} 76 Q${W(115)} 110 ${W(117)} 146 L${W(108)} 147 Q${W(105)} 112 ${W(98)} 86 Z`, skin);

  // ---- bottoms ----
  const b = worn.bottom;
  if (b) {
    const { fill, base } = paint(b, "#33507e");
    const hem = LEN_Y[b.length ?? "ankle"] ?? 224;
    const wide = b.fit === "wide" ? 6 : b.fit === "slim" ? -1 : 2;
    if (b.shape === "skirt") {
      const flare = b.fit === "wide" ? 14 : 8;
      path(body, `M${W(63)} 132 L${W(97)} 132 L${W(97 + flare)} ${hem} Q80 ${hem + 3} ${W(63 - flare)} ${hem} Z`, fill, base);
    } else {
      path(body, `M${W(62)} 132 L${W(98)} 132 L${W(98 + wide)} ${hem} L${82 - Math.max(0, wide) / 2} ${hem} L80 158 L${78 + Math.max(0, wide) / 2} ${hem} L${W(62 - wide)} ${hem} Z`, fill, base);
      if (b.texture === "denim") line(body, `M80 134 V156 M${W(66)} 138 Q${W(70)} 142 ${W(74)} 138`, base);
      if (b.detail === "cargo") body.push(`<rect x="${W(60) - 2}" y="${Math.min(176, hem - 22)}" width="11" height="14" rx="2" fill="${mix(base, 0.86)}" ${st(base)}/><rect x="${W(100) - 9}" y="${Math.min(176, hem - 22)}" width="11" height="14" rx="2" fill="${mix(base, 0.86)}" ${st(base)}/>`);
      if (b.detail === "cuff") line(body, `M${W(62 - wide)} ${hem - 4} H${79} M81 ${hem - 4} H${W(98 + wide)}`, base, 3);
      if (b.detail === "crease") line(body, `M${W(70)} 150 V${hem} M${W(90)} 150 V${hem}`, base, 0.8);
    }
  }

  // ---- one function for every upper garment (tops, outers, the top of a dress) ----
  const upper = (g: Garment, layer: "top" | "outer" | "dress", inner: Garment | undefined) => {
    const { fill, base } = paint(g, layer === "outer" ? "#4a5568" : "#f4f4f1");
    const puff = g.texture === "quilted" ? (g.fit === "wide" ? 4 : 2) : 0;
    const fitW = (g.fit === "wide" ? 3 : g.fit === "slim" ? -1 : 0) + puff + (layer === "outer" ? 2 : 0);
    const L = 60 - fitW, R = 100 + fitW;
    const hem = layer === "dress" ? 128 : LEN_Y[g.length ?? "hip"] ?? 142;
    const sleeve = g.sleeve ?? "long";
    if (g.neck === "hood") path(back, `M${W(64)} 76 Q${W(58)} 56 80 52 Q${W(102)} 56 ${W(96)} 76 Z`, mix(base, 0.9), base);
    if (layer === "dress") {
      const dHem = LEN_Y[g.length ?? "knee"] ?? 192;
      const flare = g.fit === "wide" ? 16 : 9;
      path(body, `M${W(L)} 74 Q80 69 ${W(R)} 74 L${W(R - 1)} 128 L${W(R + flare)} ${dHem} Q80 ${dHem + 3} ${W(L - flare)} ${dHem} L${W(L + 1)} 128 Z`, fill, base);
    } else {
      path(body, `M${W(L)} 74 Q80 68 ${W(R)} 74 L${W(R + 1)} ${hem} Q80 ${hem + 2} ${W(L - 1)} ${hem} Z`, fill, base);
    }
    if (sleeve !== "none") {
      const end = sleeve === "short" ? 100 : 145;
      const outX = sleeve === "short" ? 7 : 0;
      path(body, `M${W(L)} 74 Q${W(L - 12)} 104 ${W(L - 19 + outX)} ${end} L${W(L - 7 + outX)} ${end + 1} Q${W(L - 4)} 104 ${W(62)} 88 Z`, fill, base);
      path(body, `M${W(R)} 74 Q${W(R + 12)} 104 ${W(R + 19 - outX)} ${end} L${W(R + 7 - outX)} ${end + 1} Q${W(R + 4)} 104 ${W(98)} 88 Z`, fill, base);
      if (g.texture === "rib") line(body, `M${W(L - 19 + outX)} ${end - 3} L${W(L - 7 + outX)} ${end - 2} M${W(R + 19 - outX)} ${end - 3} L${W(R + 7 - outX)} ${end - 2}`, base, 3);
    }
    // neckline
    const n = g.neck ?? "crew";
    if (n === "turtle") path(body, `M72 62 H88 V76 Q80 79 72 76 Z`, mix(base, 0.95), base);
    if (n === "collar") { path(body, `M72 70 L80 82 L76 86 L66 74 Z`, mix(base, 1.06), base); path(body, `M88 70 L80 82 L84 86 L94 74 Z`, mix(base, 1.06), base); }
    if (n === "v") path(body, `M73 71 L80 86 L87 71 Z`, inner ? safe(inner.color, "#f4f4f1") : skin, base);
    if (n === "crew" && !inner && layer !== "outer") line(body, `M73 72 Q80 77 87 72`, base);
    if (n === "hood" && layer === "top") { line(body, `M76 80 V94 M84 80 V94`, base); body.push(`<path d="M${W(68)} ${hem - 26} H${W(92)} V${hem - 14} H${W(68)} Z" fill="none" ${st(base)}/>`); }
    // closure
    const c = g.closure ?? "none";
    if (c === "open" && layer === "outer") {
      const innerFill = inner ? safe(inner.color, "#f4f4f1") : skin;
      path(body, `M74 72 L80 ${Math.min(hem, 120)} L86 72 Z`, innerFill, base);
      line(body, `M80 ${Math.min(hem, 120)} V${hem}`, base);
    } else if (c === "zip" || (c === "buttons" && layer !== "dress")) {
      line(body, `M80 ${n === "v" ? 86 : 74} V${hem}`, base);
      if (c === "buttons") for (let y = 90; y < hem - 6; y += 12) body.push(`<circle cx="82" cy="${y}" r="1.2" fill="${mix(base, 0.6)}"/>`);
    }
    // texture
    if (g.texture === "quilted") for (let y = 86; y < hem - 4; y += g.fit === "wide" ? 13 : 9) line(body, `M${W(L - 1)} ${y} Q80 ${y + 2} ${W(R + 1)} ${y}`, base);
    if (g.texture === "rib" && layer !== "dress") line(body, `M${W(L)} ${hem - 4} H${W(R)}`, base, 3);
    if (g.texture === "denim") line(body, `M${W(L + 4)} 94 H${W(76)} M${W(84)} 94 H${W(R - 4)}`, base, 1.6);
    if (g.texture === "leather") line(body, `M${W(L + 6)} 84 Q${W(L + 4)} 108 ${W(L + 7)} ${hem - 8}`, "#ffffff", 1.2);
    if (g.belt) line(body, `M${W(L)} 132 H${W(R)}`, base, 4);
  };
  if (worn.dress) upper(worn.dress, "dress", undefined);
  if (worn.top) upper(worn.top, "top", undefined);
  if (worn.outer) upper(worn.outer, "outer", worn.top ?? worn.dress);

  // ---- shoes ----
  const s = worn.shoes;
  if (s) {
    const base = safe(s.color, "#f4f4f1");
    const style = s.style ?? "sneaker";
    const top = style === "boot" || style === "trek" ? 214 : style === "heel" ? 226 : 223;
    const sole = style === "runner" || style === "trek" ? mix(base, 1.3) : mix(base, 0.6);
    if (style === "sandal" || style === "slipper") {
      body.push(`<ellipse cx="${W(70)}" cy="231" rx="8" ry="4" fill="${skin}"/><ellipse cx="${W(90)}" cy="231" rx="8" ry="4" fill="${skin}"/>`);
      line(body, `M${W(63)} 229 Q${W(70)} 225 ${W(77)} 229 M${W(83)} 229 Q${W(90)} 225 ${W(97)} 229`, base, 3);
      line(body, `M${W(60)} 235 H79 M81 235 H${W(100)}`, base, 2.4);
    } else {
      path(body, `M${W(64)} ${top} L79 ${top} L79 234 L${W(57)} 234 Q${W(57)} 228 ${W(64)} ${top} Z`, base);
      path(body, `M81 ${top} L${W(96)} ${top} Q${W(103)} 228 ${W(103)} 234 L81 234 Z`, base);
      body.push(`<path d="M${W(57)} 234.5 H79 M81 234.5 H${W(103)}" stroke="${sole}" stroke-width="3" vector-effect="non-scaling-stroke"/>`);
      if (style === "sneaker" || style === "runner") line(body, `M${W(66)} 229 L${W(73)} 226 M${W(94)} 229 L${W(87)} 226`, base, 1.6);
      if (style === "clog") body.push(`<circle cx="${W(68)}" cy="228" r="1" fill="${mix(base, 0.6)}"/><circle cx="${W(92)}" cy="228" r="1" fill="${mix(base, 0.6)}"/>`);
      if (style === "trek") line(body, `M${W(66)} ${top + 6} H78 M82 ${top + 6} H${W(94)}`, base, 1.4);
    }
  } else body.push(`<ellipse cx="${W(70)}" cy="231" rx="8" ry="4" fill="${skin}"/><ellipse cx="${W(90)}" cy="231" rx="8" ry="4" fill="${skin}"/>`);

  // hands
  const longSleeve = (g?: Garment) => !!g && g.sleeve !== "short" && g.sleeve !== "none";
  const hx = longSleeve(worn.outer) || longSleeve(worn.top) ? 0 : 0;
  body.push(`<circle cx="${W(46) - hx}" cy="150" r="5.5" fill="${skin}" ${st(skin)}/><circle cx="${W(114) + hx}" cy="150" r="5.5" fill="${skin}" ${st(skin)}/>`);

  // accessories on the body
  const a = worn.acc;
  if (a?.style === "scarf") { const { fill, base } = paint(a, "#c9473f"); path(body, "M66 68 Q80 78 94 68 L96 77 Q80 89 64 77 Z", fill, base); path(body, "M86 78 L92 110 L84 110 L82 82 Z", fill, base); }
  if (a?.style === "crossbag") { const c = safe(a.color, "#25272c"); body.push(`<path d="M${W(62)} 74 L${W(98)} 128" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/><rect x="${W(92)}" y="122" width="16" height="13" rx="3" fill="${c}" ${st(c)}/>`); }
  if (a?.style === "backpack") { const c = safe(a.color, "#25272c"); body.push(`<path d="M${W(64)} 74 L${W(66)} 122 M${W(96)} 74 L${W(94)} 122" stroke="${c}" stroke-width="3" vector-effect="non-scaling-stroke"/>`); }

  // ---- head ----
  const hair = HAIR_PRESETS[look.hairStyle]?.hair ?? HAIR_PRESETS.dandy.hair;
  drawHairBack(back, hair, hairC, st);
  path(head, "M73 52 H87 V68 H73 Z", skin);
  head.push(`<ellipse cx="80" cy="34" rx="25" ry="26" fill="${skin}" ${st(skin)}/>`);
  if (hair.sides !== "long") head.push(`<ellipse cx="55" cy="37" rx="3.5" ry="5" fill="${skin}" ${st(skin)}/><ellipse cx="105" cy="37" rx="3.5" ry="5" fill="${skin}" ${st(skin)}/>`);
  head.push(`<path d="M67 29 Q71 26.5 75 29 M85 29 Q89 26.5 93 29" fill="none" stroke="${mix(hairC, 0.95)}" stroke-width="1.7" stroke-linecap="round"/>`);
  head.push(`<ellipse cx="71" cy="37" rx="2.6" ry="3.2" fill="#2b2523"/><ellipse cx="89" cy="37" rx="2.6" ry="3.2" fill="#2b2523"/><circle cx="72" cy="36" r=".9" fill="#fff"/><circle cx="90" cy="36" r=".9" fill="#fff"/>`);
  head.push(`<ellipse cx="65" cy="45" rx="4.5" ry="2.6" fill="#f2a7a0" opacity=".5"/><ellipse cx="95" cy="45" rx="4.5" ry="2.6" fill="#f2a7a0" opacity=".5"/>`);
  head.push(`<path d="M76 47 Q80 50.5 84 47" fill="none" stroke="#b5584c" stroke-width="1.7" stroke-linecap="round"/>`);
  if (look.glasses) {
    const g = look.glasses === "square" ? `<rect x="63" y="31" width="15" height="12" rx="3"/><rect x="82" y="31" width="15" height="12" rx="3"/>` : `<circle cx="71" cy="37" r="7.5"/><circle cx="89" cy="37" r="7.5"/>`;
    head.push(`<g fill="rgba(255,255,255,.16)" stroke="#2b2523" stroke-width="1.6">${g}</g><path d="M78.5 36 Q80 35 81.5 36" fill="none" stroke="#2b2523" stroke-width="1.6"/>`);
  }
  const hat = worn.hat;
  if (hat) {
    const { fill, base } = paint(hat, "#25272c");
    if (hat.style === "beanie") { path(head, "M54 30 Q54 2 80 2 Q106 2 106 30 Z", fill, base); line(head, "M54 26 H106", base, 5); }
    else if (hat.style === "bucket") path(head, "M58 24 Q60 4 80 4 Q100 4 102 24 L110 30 Q80 36 50 30 Z", fill, base);
    else { path(head, "M56 24 Q56 4 80 4 Q104 4 104 24 Z", fill, base); path(head, "M80 21 L114 25 Q114 30 102 30 L80 27 Z", mix(base, 0.9), base); }
    if (hair.sides === "long") path(head, "M55 28 L53 48 Q58 36 61 28 Z M105 28 L107 48 Q102 36 99 28 Z", hairC);
  } else drawHairFront(head, hair, hairC, st);
  if (a?.style === "sunglasses") head.push(`<g fill="#1f1b1a" opacity=".92"><rect x="62" y="31" width="16" height="10" rx="4"/><rect x="82" y="31" width="16" height="10" rx="4"/></g><path d="M78 35 H82" stroke="#1f1b1a" stroke-width="2"/>`);

  const feetY = NECK + (FEET + 2 - NECK) * k;
  const dy = GROUND - feetY;
  return {
    defs: defs.join(""),
    top: dy,
    svg: `<g transform="translate(${x} ${dy})">${back.join("")}<g transform="translate(0 ${NECK}) scale(1 ${k}) translate(0 ${-NECK})">${body.join("")}</g>${head.join("")}</g>`,
  };
}

type Stroke = (c: string) => string;

function drawHairBack(arr: string[], h: Hair, c: string, st: Stroke) {
  const p = (d: string) => arr.push(`<path d="${d}" fill="${c}" ${st(c)}/>`);
  const end = { short: 0, neck: 64, shoulder: 84, chest: 110, long: 132 }[h.back];
  if (h.tie === "pony") p("M98 26 Q120 30 116 62 Q112 84 104 94 Q102 74 99 56 Z");
  if (h.tie === "bun") arr.push(`<circle cx="80" cy="4" r="10" fill="${c}" ${st(c)}/>`);
  if (h.tie === "half") arr.push(`<circle cx="80" cy="10" r="6" fill="${c}" ${st(c)}/>`);
  if (!end) return;
  const w = h.volume === "high" ? 32 : h.volume === "mid" ? 29 : 27;
  const L = 80 - w, R = 80 + w;
  if (h.curl === "curly") {
    // bumpy outline
    let d = `M${L + 2} 30`;
    for (let y = 40; y <= end; y += 10) d += ` Q${L - 6} ${y - 5} ${L + 1} ${y}`;
    d += ` Q80 ${end + 8} ${R - 1} ${end}`;
    for (let y = end; y >= 40; y -= 10) d += ` Q${R + 6} ${y - 5} ${R - 2} ${y - 10}`;
    p(d + " Q80 4 " + (L + 2) + " 30 Z");
  } else if (h.curl === "wave") {
    p(`M${L + 2} 32 Q${L - 6} ${end * 0.45 + 20} ${L + 2} ${end * 0.7 + 10} Q${L - 4} ${end - 6} ${L + 6} ${end} Q80 ${end + 6} ${R - 6} ${end} Q${R + 4} ${end - 6} ${R - 2} ${end * 0.7 + 10} Q${R + 6} ${end * 0.45 + 20} ${R - 2} 32 Q80 2 ${L + 2} 32 Z`);
  } else if (h.curl === "c") {
    p(`M${L + 2} 32 L${L} ${end - 6} Q${L + 2} ${end + 2} ${L + 12} ${end - 4} L80 ${end} L${R - 12} ${end - 4} Q${R - 2} ${end + 2} ${R} ${end - 6} L${R - 2} 32 Q80 2 ${L + 2} 32 Z`);
  } else if (h.layered) {
    p(`M${L + 2} 32 L${L} ${end - 14} L${L + 6} ${end - 6} L${L + 10} ${end} L80 ${end + 2} L${R - 10} ${end} L${R - 6} ${end - 6} L${R} ${end - 14} L${R - 2} 32 Q80 2 ${L + 2} 32 Z`);
  } else {
    p(`M${L + 2} 32 L${L} ${end} Q80 ${end + 4} ${R} ${end} L${R - 2} 32 Q80 2 ${L + 2} 32 Z`);
  }
}

function drawHairFront(arr: string[], h: Hair, c: string, st: Stroke) {
  const p = (d: string, fill = c) => arr.push(`<path d="${d}" fill="${fill}" ${st(c)}/>`);
  const v = { flat: 0, mid: 3, high: 6 }[h.volume];
  const capTop = 8 - v;
  // the top of the head
  const sideY = h.sides === "shaved" ? 26 : h.sides === "long" ? 48 : 34;
  p(`M54 ${sideY} Q51 ${capTop + 2} 80 ${capTop} Q109 ${capTop + 2} 106 ${sideY} Q102 22 92 20 Q80 24 68 20 Q58 22 54 ${sideY} Z`);
  if (h.sides === "shaved") arr.push(`<path d="M55 26 Q54 32 56 38 M105 26 Q106 32 104 38" stroke="${c}" stroke-width="3" opacity=".35" stroke-linecap="round" fill="none"/>`);
  if (h.sides === "long") { p("M54 30 Q50 50 54 66 L60 64 Q58 46 60 30 Z"); p("M106 30 Q110 50 106 66 L100 64 Q102 46 100 30 Z"); }
  switch (h.front) {
    case "full": p(`M55 ${sideY - 4} Q56 ${capTop + 6} 80 ${capTop + 4} Q104 ${capTop + 6} 105 ${sideY - 4} L104 28 Q92 31 80 29 Q68 31 56 28 Z`); break;
    case "crop": p(`M56 26 Q56 ${capTop + 6} 80 ${capTop + 4} Q104 ${capTop + 6} 104 26 L100 22 L96 25 L91 21 L86 25 L80 21 L74 25 L69 21 L64 25 L60 22 Z`); break;
    case "comma": p(`M55 30 Q56 ${capTop + 6} 80 ${capTop + 4} Q104 ${capTop + 6} 105 30 L103 24 Q90 18 76 24 Q66 28 64 34 Q63 39 67 40 Q62 41 60 36 Q59 32 55 30 Z`); break;
    case "curtain": p(`M55 34 Q54 ${capTop + 6} 80 ${capTop + 2} Q106 ${capTop + 6} 105 34 Q100 22 84 18 L80 22 L76 18 Q60 22 55 34 Z`); break;
    case "side": p(`M55 32 Q54 ${capTop + 6} 74 ${capTop + 2} Q106 ${capTop + 4} 106 30 Q100 18 70 20 Q60 24 55 32 Z`); break;
    case "up": p(`M55 28 Q54 ${capTop + 2} 80 ${capTop - 2} Q106 ${capTop + 2} 105 28 Q100 16 80 14 Q60 16 55 28 Z`); break;
    case "leaf": p(`M55 34 Q54 ${capTop + 6} 80 ${capTop + 2} Q106 ${capTop + 6} 106 34 Q98 20 78 22 Q64 26 60 40 Q57 38 55 34 Z`); break;
    default: break;
  }
  // long hair falls in front of the shoulders, framing the face
  const lockEnd = h.tie === "none" || h.tie === "half" ? { short: 0, neck: 0, shoulder: 78, chest: 104, long: 126 }[h.back] : 0;
  if (lockEnd) {
    const wig = h.curl === "wave" || h.curl === "curly";
    const inL = h.curl === "c" ? `Q62 ${lockEnd + 4} 66 ${lockEnd - 6}` : `L60 ${lockEnd - 2}`;
    const inR = h.curl === "c" ? `Q98 ${lockEnd + 4} 94 ${lockEnd - 6}` : `L100 ${lockEnd - 2}`;
    p(wig ? `M54 30 Q46 ${(30 + lockEnd) / 2} 54 ${lockEnd - 10} Q48 ${lockEnd} 56 ${lockEnd + 2} L62 ${lockEnd - 4} Q58 ${(30 + lockEnd) / 2} 61 40 Z`
      : `M54 30 Q49 ${(30 + lockEnd) / 2} 51 ${lockEnd} ${inL} Q59 ${(40 + lockEnd) / 2} 61 40 Z`);
    p(wig ? `M106 30 Q114 ${(30 + lockEnd) / 2} 106 ${lockEnd - 10} Q112 ${lockEnd} 104 ${lockEnd + 2} L98 ${lockEnd - 4} Q102 ${(30 + lockEnd) / 2} 99 40 Z`
      : `M106 30 Q111 ${(30 + lockEnd) / 2} 109 ${lockEnd} ${inR} Q101 ${(40 + lockEnd) / 2} 99 40 Z`);
  }
  if (h.curl === "curly") for (const [x, y] of [[60, 18], [70, 12], [80, 10], [90, 12], [100, 18]]) arr.push(`<circle cx="${x}" cy="${y - v}" r="6" fill="${c}" ${st(c)}/>`);
  if (h.curl === "wave" && (h.front === "curtain" || h.front === "side")) arr.push(`<path d="M64 20 Q70 16 76 20 M84 20 Q90 16 96 20" fill="none" stroke="${mix(c, 1.5)}" stroke-width="1.2" opacity=".6"/>`);
}

/** One or two people on the same ground line. Returns an SVG string. */
export function avatarScene(people: readonly { look: Look; items: readonly Garment[] }[], label: string): string {
  const parts = people.map((p, i) => person(p.look, wornBySlot(p.items), i * 150));
  const minTop = Math.min(...parts.map((p) => p.top)) - 6;
  const w = people.length * 150 + 10;
  const esc = label.replace(/[&<>"]/g, "");
  return `<svg viewBox="-5 ${minTop} ${w} ${GROUND + 6 - minTop}" role="img" aria-label="${esc}"><defs>${parts.map((p) => p.defs).join("")}</defs>${parts.map((p) => p.svg).join("")}</svg>`;
}
