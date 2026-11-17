import type { Garment, Look, Slot } from "../../domain/outfit";

// Flat paper-doll avatar (120×220) drawn from a look and what is worn. Pure string so it renders fast
// in lists; every color is checked to be a hex value before it goes into the markup.

const HEX = /^#[0-9a-f]{6}$/i;
const safe = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);
const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

export function avatarSvg(look: Look, worn: Partial<Record<Slot, Garment>>, label = "아바타"): string {
  const skin = safe(look.skin, "#f1cfb5");
  const hair = safe(look.hairColor, "#1f1b1a");
  const L: string[] = [];
  const p = (d: string, fill: string) => L.push(`<path d="${d}" fill="${fill}" stroke="${shade(fill, 0.78)}" stroke-width="1.2" stroke-linejoin="round"/>`);
  const col = (g: Garment | undefined, fb: string) => safe(g?.color ?? fb, fb);

  if (look.hair === "long") p("M40 30 Q40 8 60 8 Q80 8 80 30 L84 92 Q60 100 36 92 Z", hair);
  if (look.hair === "bob") p("M41 30 Q41 9 60 9 Q79 9 79 30 L81 58 Q60 64 39 58 Z", hair);
  p("M44 118 L58 118 L57 206 L46 206 Z", skin); p("M62 118 L76 118 L74 206 L63 206 Z", skin);
  p("M33 62 L25 128 L32 130 L41 70 Z", skin); p("M87 62 L95 128 L88 130 L79 70 Z", skin);
  L.push(`<circle cx="28" cy="132" r="5" fill="${skin}"/><circle cx="92" cy="132" r="5" fill="${skin}"/>`);

  const b = worn.bottom;
  if (b) {
    const c = col(b, "#33507e");
    if (b.type === "shorts") p("M40 116 L80 116 L82 150 L62 150 L60 130 L58 150 L38 150 Z", c);
    else if (b.type === "skirt") p("M41 116 L79 116 L90 168 L30 168 Z", c);
    else if (b.type === "leggings") p("M42 116 L78 116 L76 206 L63 206 L60 132 L57 206 L44 206 Z", c);
    else {
      const w = b.type === "slacks" ? 2 : b.type === "hike" ? 1 : 0;
      p(`M40 116 L80 116 L${81 + w} 206 L${62 - w} 206 L60 134 L${58 + w} 206 L${39 - w} 206 Z`, c);
      if (b.type === "hike") L.push(`<rect x="41" y="150" width="9" height="12" rx="2" fill="${shade(c, 0.82)}"/><rect x="70" y="150" width="9" height="12" rx="2" fill="${shade(c, 0.82)}"/>`);
      if (b.type === "jeans") L.push(`<path d="M60 118 V134" stroke="${shade(c, 0.7)}" stroke-width="1"/>`);
    }
  }
  if (worn.dress) p("M36 58 Q60 50 84 58 L88 96 L82 98 L82 110 L94 172 L26 172 L38 110 L38 98 L32 96 Z", col(worn.dress, "#d6c3a2"));
  const t = worn.top;
  if (t) {
    const c = col(t, "#f4f4f1");
    const tee = t.type === "tee";
    const sleeve = tee ? 84 : 124;
    p(`M36 58 Q60 51 84 58 L${tee ? 92 : 96} ${sleeve} L88 ${sleeve + 3} L82 82 L82 120 L38 120 L38 82 L32 ${sleeve + 3} L${tee ? 28 : 24} ${sleeve} Z`, c);
    if (t.type === "shirt") L.push(`<path d="M60 56 V120" stroke="${shade(c, 0.7)}" stroke-width="1"/><path d="M52 55 L60 64 L68 55" fill="none" stroke="${shade(c, 0.7)}" stroke-width="1.2"/>`);
    if (t.type === "hoodie") p("M46 56 Q60 66 74 56 Q72 46 60 46 Q48 46 46 56 Z", shade(c, 0.9));
    if (t.type === "knit" || t.type === "sweat") L.push(`<path d="M38 114 H82" stroke="${shade(c, 0.78)}" stroke-width="3"/>`);
  }
  const w = worn.outer;
  if (w) {
    const c = col(w, "#4a5568");
    const hem = w.type === "coat" ? 162 : w.type === "padding" ? 128 : 124;
    p(`M34 57 Q60 49 86 57 L98 126 L89 130 L84 86 L84 ${hem} L36 ${hem} L36 86 L31 130 L22 126 Z`, c);
    L.push(`<path d="M60 56 V${hem}" stroke="${shade(c, 0.7)}" stroke-width="1.4"/>`);
    if (w.type === "padding" || w.type === "lightpad") for (let y = 72; y < hem - 4; y += w.type === "lightpad" ? 10 : 14) L.push(`<path d="M37 ${y} H83" stroke="${shade(c, 0.82)}" stroke-width="1.2"/>`);
    if (w.type === "wind") L.push(`<path d="M46 50 Q60 44 74 50" fill="none" stroke="${shade(c, 0.7)}" stroke-width="2"/>`);
    if (w.type === "fleece") L.push(`<path d="M50 54 L60 60 L70 54" fill="none" stroke="${shade(c, 0.75)}" stroke-width="2"/>`);
  }
  const s = worn.shoes;
  if (s) {
    const c = col(s, "#f4f4f1");
    const top = s.type === "boots" ? 194 : 202;
    p(`M43 ${top} L58 ${top} L60 212 L38 212 Q38 206 43 ${top} Z`, c); p(`M62 ${top} L77 ${top} Q82 206 82 212 L60 212 Z`, c);
    if (s.type !== "sandals") L.push(`<path d="M38 212 H60 M60 212 H82" stroke="${shade(c, 0.6)}" stroke-width="2.4"/>`);
  } else L.push(`<ellipse cx="50" cy="209" rx="9" ry="4" fill="${skin}"/><ellipse cx="70" cy="209" rx="9" ry="4" fill="${skin}"/>`);

  p("M55 46 H65 V58 H55 Z", skin);
  L.push(`<circle cx="60" cy="32" r="16" fill="${skin}" stroke="${shade(skin, 0.82)}" stroke-width="1.2"/>`);
  L.push(`<circle cx="54" cy="34" r="1.6" fill="#2b2b2b"/><circle cx="66" cy="34" r="1.6" fill="#2b2b2b"/><path d="M56 40 Q60 43 64 40" fill="none" stroke="#b05a4f" stroke-width="1.4" stroke-linecap="round"/>`);
  L.push(`<circle cx="51" cy="39" r="2.4" fill="#f2a7a0" opacity=".45"/><circle cx="69" cy="39" r="2.4" fill="#f2a7a0" opacity=".45"/>`);
  const h = worn.hat;
  if (h) {
    const c = col(h, "#25272c");
    if (h.type === "beanie") p("M43 30 Q43 12 60 12 Q77 12 77 30 Z", c);
    else { p("M44 26 Q44 13 60 13 Q76 13 76 26 Z", c); p("M60 24 L86 26 Q86 30 76 30 L60 28 Z", shade(c, 0.9)); }
  } else if (look.hair === "short") p("M44 30 Q42 14 60 14 Q78 14 76 30 Q70 22 60 22 Q50 22 44 30 Z", hair);
  else if (look.hair === "tied") { p("M44 30 Q42 14 60 14 Q78 14 76 30 Q68 21 60 21 Q52 21 44 30 Z", hair); L.push(`<circle cx="60" cy="12" r="7" fill="${hair}"/>`); }
  else p("M44 32 Q42 14 60 14 Q78 14 76 32 Q70 20 60 22 Q50 20 44 32 Z", hair);

  const sx = ({ slim: 0.9, avg: 1, broad: 1.12 }[look.build] ?? 1) * (look.body === "f" ? 0.95 : 1);
  const esc = label.replace(/[&<>"]/g, "");
  return `<svg viewBox="0 0 120 220" role="img" aria-label="${esc}"><g transform="translate(60 0) scale(${sx} 1) translate(-60 0)">${L.join("")}</g></svg>`;
}
