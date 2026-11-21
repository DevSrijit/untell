// Shadow bars: the shadow of a venetian blind, cast by a hard key light on one near plane (Noir's shadow-bars).
// The bars fall on a plane (the picture, a wall), never on the whole frame, and they keep the type in the light.
//
// Rules this block enforces:
// - Only a system whose `allows` lists "shadow-bars" may use it (Noir). Any other system throws.
// - Every edge is hard: the bars are flat polygons in the ground colour at `depth`, cut to the plane box. No
//   gradient, no blur.
// - keepLit: the bars' phase is solved so that no listed text sits in a dark bar. The block tries every phase on
//   a 1 px step and keeps the one with the widest lit margin round the text. When no phase keeps all of it lit, it
//   widens the period in 5 % steps, up to `stretch` times (default 1.6), with the same duty. When even that fails,
//   it keeps the phase with the least text in shadow and warns with the share in shadow. A lit gap must hold a
//   whole line across the bars, so near-level bars (angle -6 to -15) suit a title of more than one line.
// - The bars are light, not an object: they cut on at `at` (one frame) and off at `until`, or, with `exit: "fade"`,
//   fade out over the system's exit time from `until` (the slat light dies on the last beat). They draw in the
//   content layer under the text by default, so a bar never draws over a letter.
// - keepLit keeps each text in a lit gap of its own: texts far apart on the frame sit in different gaps. The period
//   grows as far as the kept text needs, and never past 4 times the base (unless `stretch` asks), so the bars stay slats.
// - It names the result: anchor `<id>-phase` (data: phase, period, dark, shadowed share of the kept text).
import { go, present, px } from "../context";
import type { Block, Ctx, Node, TextNode } from "../types";

export type ShadowBarsProps = {
  id?: string;
  /** The plane the bars fall on, px. Default: the whole frame. */
  plane?: { x: number; y: number; w: number; h: number };
  /** The bars' direction in degrees from horizontal (default -35: rising to the right). */
  angle?: number;
  /** The distance from one bar to the next, px (default 9 % of the frame height). */
  period?: number;
  /** The share of each period in shadow, 0-1 (default 0.5). Over 0.5 the frame reads as lit slats on dark. */
  duty?: number;
  /** How dark the shadow is, 0-1 (default 0.82). */
  depth?: number;
  /** Text nodes (from any block) that must stay in the light. */
  keepLit?: Node[];
  /** How far keepLit may widen the period to find a phase that keeps all the text lit (default 1.6, 1 = never). */
  stretch?: number;
  /** The layer the bars draw in (default 0, under the text of that layer). */
  layer?: number;
  /** How the bars leave at `until`: "cut" (default, one frame) or "fade" (over the system's exit time). */
  exit?: "cut" | "fade";
  at: number;
  until?: number;
};

type Pt = [number, number];

/** A convex polygon cut by the half-plane p·n >= c (Sutherland-Hodgman). */
function cut(poly: Pt[], n: Pt, c: number): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => p[0] * n[0] + p[1] * n[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** The box of a text node at rest, in px: its measured width (or its fixed width) and its line height. */
function textBox(ctx: Ctx, n: TextNode): { x: number; y: number; w: number; h: number } {
  const last = (k: "x" | "y") => n.tracks?.[k]?.[n.tracks[k]!.length - 1]?.v ?? 0;
  const w = ctx.measure(n.text, n.role, { keepCase: n.keepCase });
  const off = n.width && n.align === "center" ? (n.width - w) / 2 : n.width && n.align === "right" ? n.width - w : 0;
  return { x: n.x + off + last("x"), y: n.y + last("y"), w, h: ctx.lineHeight(n.role) };
}

export const shadowBars: Block<ShadowBarsProps> = (p, ctx) => {
  const id = p.id ?? "bars";
  if (!ctx.system.allows.includes("shadow-bars")) throw new Error(`shadowBars ${id}: ${ctx.system.name} does not allow shadow-bars (allows: ${ctx.system.allows.join(", ") || "none"})`);
  const plane = p.plane ?? { x: 0, y: 0, w: ctx.width, h: ctx.height };
  const angle = ((p.angle ?? -35) * Math.PI) / 180;
  const base = p.period ?? Math.round(ctx.height * 0.09);
  const duty = Math.min(0.9, Math.max(0.1, p.duty ?? 0.5));
  // The unit normal across the bars: a point's phase is its position along it.
  const n: Pt = [-Math.sin(angle), Math.cos(angle)];
  const along = (x: number, y: number) => x * n[0] + y * n[1];
  const corners = (b: { x: number; y: number; w: number; h: number }): Pt[] => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];

  // keepLit: each text's span along the normal. A phase f puts bar k on [f + k period, f + k period + dark).
  const spans = (p.keepLit ?? []).filter((m): m is TextNode => m.kind === "text").map((t) => {
    const v = corners(textBox(ctx, t)).map(([x, y]) => along(x, y));
    return [Math.min(...v), Math.max(...v)] as const;
  });
  const total = spans.reduce((s, [a, b]) => s + (b - a), 0);
  // For a period and a phase: the share of the text spans in shadow, and the smallest lit margin round any span.
  const score = (period: number, f: number) => {
    const dark = period * duty;
    const mod = (v: number) => ((v % period) + period) % period;
    let shadow = 0, margin = Infinity;
    for (const [a, b] of spans) {
      // Walk the span one period at a time; the dark part of each period is [0, dark) after the shift.
      const s0 = a - f;
      for (let k = Math.floor(s0 / period) - 1; k * period + f < b; k++) {
        const d0 = f + k * period, d1 = d0 + dark;
        shadow += Math.max(0, Math.min(b, d1) - Math.max(a, d0));
      }
      // The lit gap that holds the span, when the span fits in one: its distance to the dark on either side.
      const start = mod(a - f), end = start + (b - a);
      if (start >= dark && end <= period) margin = Math.min(margin, start - dark, period - end);
      else margin = -1;
    }
    return { shadow: total ? shadow / total : 0, margin };
  };
  let period = base, best = 0, bestScore = score(base, 0);
  const better = (a: ReturnType<typeof score>, b: ReturnType<typeof score>) => a.shadow < b.shadow - 1e-9 || (Math.abs(a.shadow - b.shadow) < 1e-9 && a.margin > b.margin);
  // The longest the period may grow: the stretch asked (1.6 by default), and at least what lets one lit band hold the
  // tallest kept line with a margin (a two-row headline is taller than the default lit band: no phase could keep it lit).
  // The kept text across the bars' axis, all lines together: one lit band holds them all.
  // Each text needs a lit gap of its own, not one gap for all: the tallest single text sets the reach (before, all the
  // kept text together did, so an end card's title and line far apart stretched the bars into one large shadow).
  // The search grows the period from the base and stops at the first one with a phase that keeps every text lit: texts
  // far apart sit in lit gaps of their own. It goes on toward one lit band for all the kept text, never past 4 times
  // the base (before, it had no cap, and an end card's slats became one large shadow).
  const need = (h: number) => (h * 1.25) / Math.max(0.1, 1 - duty);
  const all = spans.length ? Math.max(...spans.map(([, b]) => b)) - Math.min(...spans.map(([a]) => a)) : 0;
  const reach = spans.length ? Math.max(base * (p.stretch ?? 1.6), p.stretch === undefined ? Math.min(base * 4, need(all)) : 0) : base;
  for (let q = base; q <= reach + 1e-9; q = q * 1.05) {
    const qp = Math.round(q);
    for (let f = 0; f < qp; f++) {
      const s = score(qp, f);
      if (better(s, bestScore)) { period = qp; best = f; bestScore = s; }
    }
    if (bestScore.shadow === 0) break;
  }
  const dark = period * duty;
  if (bestScore.shadow > 0) console.warn(`shadowBars ${id}: no phase keeps all the kept text lit; ${(bestScore.shadow * 100).toFixed(0)} % of it is in shadow. The bars stay slats (a period of at most 4 times the base), so a tall block of text does not fit one lit band: keep fewer lines lit (the title, not its line), use a near-level angle (-6 to -15), a smaller duty, or give stretch to allow a longer period.`);

  // The bars: each dark band cut to the plane, as one path of hard-edged polygons.
  const pv = corners(plane).map(([x, y]) => along(x, y));
  const lo = Math.min(...pv), hi = Math.max(...pv);
  const parts: string[] = [];
  for (let k = Math.floor((lo - best) / period) - 1; best + k * period < hi; k++) {
    const d0 = best + k * period;
    let poly = cut(corners(plane), n, d0);
    poly = cut(poly, [-n[0], -n[1]], -(d0 + dark));
    if (poly.length >= 3) parts.push(poly.map(([x, y], i) => `${i ? "L" : "M"}${px(x)} ${px(y)}`).join("") + "Z");
  }
  const depth = p.depth ?? 0.82;
  const fade = p.exit === "fade" && p.until !== undefined && !ctx.instant;
  const opacity = fade
    ? [...present(p.at).opacity!.map((k) => ({ ...k, v: k.v * depth })), ...go(ctx, p.until!, depth, 0, "exit")]
    : present(p.at, p.until).opacity!.map((k) => ({ ...k, v: k.v * depth }));
  return [
    { id, kind: "path", d: parts.join(""), fill: "ground", layer: p.layer ?? 0, z: -1, box: plane, tracks: { opacity } },
    { id: `${id}-phase`, kind: "anchor", ...plane, at: p.at, data: { phase: best, period, dark, shadowed: bestScore.shadow } },
  ];
};
