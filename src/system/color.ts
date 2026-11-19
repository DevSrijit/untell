// The colour system. Colours are authored in OKLCH, where equal steps in L look equal, and resolved to
// sRGB hex at build time. A colour outside the sRGB gamut keeps its lightness and hue and loses chroma
// until it fits, so the browser never decides how to clip it.
//
// Agents never use colour values. They use roles: a palette maps each role to one resolved colour.

export type Oklch = { l: number; c: number; h: number };

const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const fromLinear = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

/** OKLCH to linear sRGB, per Björn Ottosson's reference matrices. Values can fall outside 0..1. */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** sRGB (0..1 per channel) to OKLCH. */
export function srgbToOklch([r, g, b]: [number, number, number]): Oklch {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, bb);
  return { l: L, c, h: c < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

const inGamut = (rgb: number[]) => rgb.every((x) => x >= -1e-6 && x <= 1 + 1e-6);

/** Resolves OKLCH to an in-gamut sRGB triple (0..1), reducing chroma if needed. */
export function resolve(color: Oklch): { rgb: [number, number, number]; chroma: number } {
  let lin = oklchToLinear(color);
  let chroma = color.c;
  if (!inGamut(lin)) {
    let lo = 0, hi = color.c;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid; else hi = mid;
    }
    chroma = lo;
    lin = oklchToLinear({ ...color, c: lo });
  }
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return { rgb: lin.map((x) => clamp(fromLinear(clamp(x)))) as [number, number, number], chroma };
}

export function hex(color: Oklch): string {
  return "#" + resolve(color).rgb.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** WCAG 2 contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = hexToRgb(h).map(toLinear) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Mixes two hex colours in OKLab, for tints such as a 20 % rule colour. */
export function mix(a: string, b: string, t: number): string {
  const A = srgbToOklch(hexToRgb(a)), B = srgbToOklch(hexToRgb(b));
  const ab = (o: Oklch) => [o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
  const [a1, b1] = ab(A) as [number, number], [a2, b2] = ab(B) as [number, number];
  const l = A.l + (B.l - A.l) * t, aa = a1 + (a2 - a1) * t, bb = b1 + (b2 - b1) * t;
  return hex({ l, c: Math.hypot(aa, bb), h: ((Math.atan2(bb, aa) * 180) / Math.PI + 360) % 360 });
}

// ---------- palettes ----------

/**
 * The roles. `accent` is a fill (a highlight band, a bar, a dot). `accentText` is the accent when it
 * must be read as text; in some palettes it differs from the fill. `series` is for data, in a fixed order.
 */
export type Role =
  | "ground" | "surface" | "rule" | "ink" | "inkMuted" | "accent" | "accentText" | "onAccent"
  | "series1" | "series2" | "series3" | "series4" | "series5" | "positive" | "negative";

export type PaletteSpec = { name: string; pattern: string; reference: string; roles: Record<Role, Oklch> };
export type Palette = { name: string; pattern: string; reference: string; roles: Record<Role, string> };

export function build(spec: PaletteSpec): Palette {
  const roles = Object.fromEntries(Object.entries(spec.roles).map(([k, v]) => [k, hex(v)])) as Record<Role, string>;
  return { name: spec.name, pattern: spec.pattern, reference: spec.reference, roles };
}
