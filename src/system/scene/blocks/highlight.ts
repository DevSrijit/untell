// Highlight: emphasis on text that is already on screen. An underline that draws, a marker box behind
// the words, or a loop drawn around them. The scene gives the text's box (from ctx.measure) and role.
//
// Rules this block enforces:
// - It never covers the text's ink. The underline sits below the lowest ink of the words (below the
//   descenders when the words have any). The loop passes outside the ink box at every point, and keeps
//   clear of the `avoid` boxes (the lines around the words): it flattens, and if it still cannot fit,
//   the block draws an underline or a marker instead. The marker
//   is a box, and both renderers draw every box below every text.
// - The marker colour keeps the text readable: it takes the first of accent, accent2, accent3 and rule
//   on which the text colour keeps 4.5:1. In Spec the accent equals the ink, so the marker is the rule grey.
// - A stroke never passes its end: draw tracks use a curve that does not overshoot.
// - Meaning does not ride on colour: the mark itself (a line, a box, a loop) carries the emphasis.
//
// This file also holds the text geometry that the grammar blocks share: where the baseline and the ink
// of a text box are, from the font metrics measured in Chrome (layout.inkMetrics).
import { appear, go } from "../context";
import { colorOf, inkBand, inkMetrics } from "../layout";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";
import type { Box } from "./util";

/**
 * Font metrics as fractions of the font size, from the one ink table (layout.inkMetrics, measured in Chrome from the
 * font files). A, D: the font's ascent and descent. An inline text box (its "content area", the box that hyperframes
 * check measures) reaches from A above the baseline to D below it, past the line box when the leading is tight.
 * k: the baseline's offset below the centre of the line box. cap, digit, asc: ink heights above the baseline of
 * capitals, figures and lower-case ascenders. desc: depth of g, j, p, q, y. capDesc: depth of Q and J.
 */
export function metricsOf(ctx: Ctx, role: TypeRole) {
  const m = inkMetrics(ctx.system, role);
  return { A: m.ascent, D: m.descent, k: (m.ascent - m.descent) / 2, cap: m.cap, digit: m.digit, asc: m.asc, desc: m.desc, capDesc: m.capDesc };
}
/** The baseline of a text box set at `y` (its top) in `role`. */
export function baselineOf(ctx: Ctx, role: TypeRole, y: number): number {
  // The same baseline the renderers draw (layout.inkBand: Chrome's rounding of the ascent, descent and half leading).
  return y + inkBand(ctx, "x", role).baseline;
}

/**
 * The vertical extent of a text line as the checks see it: the larger of its line box and its content
 * area. Place text by this box near a safe-area edge.
 */
export function layoutOf(ctx: Ctx, role: TypeRole, y: number): { top: number; bottom: number } {
  const m = metricsOf(ctx, role), s = ctx.size(role), base = baselineOf(ctx, role, y);
  return { top: Math.min(y, base - m.A * s), bottom: Math.max(y + ctx.lineHeight(role), base + m.D * s) };
}

/**
 * The vertical extent of a text's ink: from the top of its tallest glyph to the bottom of its lowest.
 * Without `text` it assumes ascenders and descenders, so the result is safe for any words.
 */
export function inkOf(ctx: Ctx, role: TypeRole, y: number, text?: string): { top: number; baseline: number; bottom: number } {
  const m = metricsOf(ctx, role), s = ctx.size(role);
  const base = baselineOf(ctx, role, y);
  const t = text === undefined ? undefined : ctx.system.type[role].uppercase ? text.toUpperCase() : text;
  const up = t === undefined ? Math.max(m.cap, m.digit, m.asc)
    : Math.max(/[A-Z]/.test(t) ? m.cap : 0, /[0-9]/.test(t) ? m.digit : 0, /[bdfhklt/()[\]{}|]|[^\x00-\x7F]/.test(t) ? m.asc : 0, /[a-z]/.test(t) ? m.cap * 0.75 : 0, /[^\s]/.test(t) ? m.cap * 0.5 : 0);
  // Brackets, slashes and commas reach below the baseline in most faces; treat them as descenders.
  const down = t === undefined ? Math.max(m.desc, m.capDesc)
    : /[gjpqy/()[\]{}|,;]/.test(t) ? m.desc : /[QJ]/.test(t) ? m.capDesc : 0.02;
  return { top: base - up * s, baseline: base, bottom: base + down * s };
}

// WCAG contrast between two hex colours.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
const has = (ctx: Ctx, r: ColorRole) => { try { colorOf(ctx.system, r); return true; } catch { return false; } };

/** The marker fill: the first role on which `text` keeps 4.5:1 and that shows on the ground. */
export function markerFill(ctx: Ctx, text: ColorRole = "ink"): ColorRole {
  const ink = colorOf(ctx.system, text), ground = colorOf(ctx.system, "ground");
  for (const r of ["accent", "accent2", "accent3", "rule"] as ColorRole[]) {
    if (!has(ctx, r)) continue;
    const c = colorOf(ctx.system, r);
    if (contrast(ink, c) >= 4.5 && contrast(ground, c) >= 1.25) return r;
  }
  return "rule";
}

export type HighlightProps = {
  id?: string;
  /** The words' text box: x and y of the text node, w from ctx.measure, h the role's line height. */
  target: Box;
  /** The role the words are set in. It places the mark against the real ink. */
  role: TypeRole;
  /** The words themselves, so the block knows if they have descenders. Without it, it assumes they do. */
  text?: string;
  style: "underline" | "marker" | "circle";
  /** The stroke or marker colour. Default: accent for strokes; for the marker, see markerFill. */
  color?: ColorRole;
  /** Text and marks near the words (the other lines, the words beside them). The loop flattens to keep
   *  clear of them; when it cannot, the block draws an underline, or a marker, instead. */
  avoid?: Box[];
  /** The colour of the words, for the marker's contrast check. Default ink. */
  textColor?: ColorRole;
  at: number;
  until?: number;
};

type Geo = { kind: "underline" | "marker" | "circle"; bounds: Box; d?: string; rect?: Box; width: number; radius: number; warn?: string };
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function geometry(p: HighlightProps, ctx: Ctx): Geo {
  const s = ctx.size(p.role);
  const ink = inkOf(ctx, p.role, p.target.y, p.text);
  const x0 = p.target.x, x1 = p.target.x + p.target.w;
  const width = Math.min(ctx.stroke * 1.5, s * 0.09);
  if (p.style === "underline") {
    const y = Math.round(ink.bottom + Math.max(width * 1.5, s * 0.08) + width / 2);
    return { kind: "underline", d: `M${x0} ${y}H${x1}`, width, radius: 0, bounds: { x: x0, y: y - width / 2, w: x1 - x0, h: width } };
  }
  if (p.style === "marker") {
    const padX = s * 0.12, padY = s * 0.1;
    const rect = { x: Math.round(x0 - padX), y: Math.round(ink.top - padY), w: Math.round(x1 - x0 + padX * 2), h: Math.round(ink.bottom - ink.top + padY * 2) };
    return { kind: "marker", rect, width: 0, radius: Math.min(ctx.radius, rect.h * 0.25), bounds: rect };
  }
  // A loop around the ink box: a superellipse (|x/a|^n + |y/b|^n = 1), which hugs a word more closely
  // than an ellipse. With b = hh * kb, a = hw / (1 - kb^-n)^(1/n) puts each corner of the box exactly
  // on the curve; the gap adds the stroke and air. A tighter kb makes the loop flatter and wider.
  const gap = s * 0.1 + width;
  const cx = (x0 + x1) / 2, cy = (ink.top + ink.bottom) / 2;
  const hw = (x1 - x0) / 2 + gap, hh = (ink.bottom - ink.top) / 2 + gap;
  const n = 3.2, R = 1.04; // R: the loop's end passes 4 % outside its start, as a hand draws it
  for (const kb of [1.3, 1.2, 1.12, 1.07]) {
    const b = hh * kb, a = hw / (1 - kb ** -n) ** (1 / n);
    const bounds = { x: cx - a * R - width, y: cy - b * R - width, w: (a * R + width) * 2, h: (b * R + width) * 2 };
    if ((p.avoid ?? []).some((o) => hits(bounds, o))) continue;
    // One turn and a little more, from the upper left, clockwise.
    const steps = 120, turn = 1.1, start = Math.PI * 1.15;
    const pts: string[] = [];
    const sp = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / n);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps, th = start + f * turn * Math.PI * 2, r = 1 + (R - 1) * f;
      pts.push(`${i ? "L" : "M"}${(cx + sp(Math.cos(th)) * a * r).toFixed(1)} ${(cy + sp(Math.sin(th)) * b * r).toFixed(1)}`);
    }
    return { kind: "circle", d: pts.join(""), width, radius: 0, bounds };
  }
  // No loop fits between the neighbours: make do with a mark that needs less room.
  const fallback = geometry({ ...p, style: "underline" }, ctx);
  if (!(p.avoid ?? []).some((o) => hits(fallback.bounds, o))) return { ...fallback, warn: "underline" };
  return { ...geometry({ ...p, style: "marker" }, ctx), warn: "marker" };
}

/** Where the mark draws, so a scene can keep other things (an annotation label) away from it. */
export function highlightBounds(p: HighlightProps, ctx: Ctx): Box {
  return geometry(p, ctx).bounds;
}

export const highlight: Block<HighlightProps> = (p, ctx) => {
  const id = p.id ?? "hl";
  const g = geometry(p, ctx);
  if (g.warn) console.warn(`highlight ${id}: no room for a loop; it draws a ${g.warn} instead`);
  const fade = appear(ctx, p.at, p.until, 0);
  if (g.kind === "marker") {
    const r = g.rect!;
    return [{ id: `${id}-mark`, kind: "rect", x: r.x, y: r.y, w: r.w, h: r.h, fill: p.color ?? markerFill(ctx, p.textColor), radius: g.radius, origin: [0, 0.5],
      tracks: { ...fade, scaleX: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 0.8, "move") } }];
  }
  const grow = g.kind === "circle" ? 1.3 : 0.8;
  const out: Node[] = [{ id: `${id}-${g.kind}`, kind: "path", d: g.d!, stroke: p.color ?? "accent", width: g.width, cap: "round", join: "round",
    tracks: { ...fade, draw: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), grow, "move") } }];
  return out;
};

/**
 * The box of `word` inside lines of text set at (x, y) in `role`, for a highlight or an annotation
 * target. It finds the first line that holds the word. Null when no line holds it.
 */
export function wordBox(ctx: Ctx, lines: string[], x: number, y: number, role: TypeRole, word: string): Box | null {
  const lh = ctx.lineHeight(role);
  for (let i = 0; i < lines.length; i++) {
    const k = lines[i]!.indexOf(word);
    if (k < 0) continue;
    return { x: x + (k ? ctx.measure(lines[i]!.slice(0, k), role) : 0), y: y + i * lh, w: ctx.measure(word, role), h: lh };
  }
  return null;
}
