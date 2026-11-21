// Flow: boxes joined by arrows, and packets that travel along the arrows to show data moving.
// Use it for a system: a browser, a cache and a server; a pipeline; who sends what to whom.
//
// Rules this block enforces:
// - Every node has the same size, set from its measured label. A long label wraps to two lines. The label's ink
//   (not its line box) is centred in the node (layout.centreInkLines).
// - Edges run straight or at right angles in the channels between nodes. A route that passes
//   through another node is rejected. Two edges never share a line: they get separate ports.
// - The layout is a grid of columns and rows. When the box is taller than it is wide, the grid
//   turns: columns become rows, so the diagram stacks vertically at 9:16.
// - A packet is a dot with x and y tracks. The edge it travels lights in the accent at a heavier
//   weight, in step with the dot. The node it reaches lights: an accent fill and onAccent text.
//   Weight and fill mark the key path, so it reads where the accent equals the ink (Spec).
// - Edge labels place themselves clear of every node, line and other label.
// - Every text box passes textSafe. When one does not, the block narrows its layout and tries again.
// - In a one-frame system there is no dot: the edge and the node light in the frame the packet arrives.
//
// This file also holds the helpers that the other diagram blocks (sequence, tree, cycle) share:
// balanced word wrap, arrowheads, rounded right-angle paths, opacity keys, the node box and a
// final geometry audit.
import { appear, go, lines as maskLines, px, seq, textSafe, cut } from "../context";
import { contrast } from "../../color";
import { colorOf, centreInkLines } from "../layout";
import { ease } from "../time";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Key, Node } from "../types";
import { placeLabels, samplePolyline, type Box } from "./util";
import { GESTURES, tagParts, textSafeBox } from "./hand";

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

export type Pt = [number, number];

/**
 * Wraps text into at most `max` lines no wider than `w`, with lines of near equal width.
 * Returns null when one word is wider than `w` or the text needs more than `max` lines.
 */
export function wrap(ctx: Ctx, text: string, role: TypeRole, w: number, max = 2): string[] | null {
  const words = text.split(" ").filter(Boolean);
  const greedy = (lim: number): string[] | null => {
    const out: string[] = [];
    let cur = "";
    for (const word of words) {
      if (ctx.measure(word, role) > lim) return null;
      const t = cur ? `${cur} ${word}` : word;
      if (ctx.measure(t, role) <= lim) cur = t;
      else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const first = greedy(w);
  if (!first || first.length > max) return null;
  if (first.length === 1) return first;
  // Balance: the narrowest width that still gives the same number of lines.
  let lo = Math.max(...words.map((x) => ctx.measure(x, role))), hi = w;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const g = greedy(mid);
    if (g && g.length <= first.length) hi = mid; else lo = mid;
  }
  return greedy(hi) ?? first;
}

/** The widest of some lines of text. */
export const widest = (ctx: Ctx, ls: string[], role: TypeRole) => Math.max(0, ...ls.map((l) => ctx.measure(l, role)));

/** Arrowhead size from the system: long enough to read at a glance, wider than the lit stroke. */
export function arrowSize(ctx: Ctx) {
  const len = Math.max(ctx.size("label") * 0.4, ctx.stroke * 5.5);
  return { len, half: len * 0.52 };
}

/** The base stroke of a diagram line and the heavier stroke of a lit (key) line. */
export const weights = (ctx: Ctx) => ({ base: ctx.stroke, lit: ctx.stroke * 2.25 });

/** A filled triangle with its tip at `tip`, pointing away from `from`. */
export function arrowHead(tip: Pt, from: Pt, len: number, half: number): string {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const bx = tip[0] - ux * len, by = tip[1] - uy * len;
  return `M${px(tip[0])} ${px(tip[1])}L${px(bx - uy * half)} ${px(by + ux * half)}L${px(bx + uy * half)} ${px(by - ux * half)}Z`;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Removes repeated points and points in the middle of a straight run. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && dist(out[out.length - 1]!, p) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!, b = out[out.length - 1]!;
      const cross = (b[0] - a[0]) * (p[1] - b[1]) - (b[1] - a[1]) * (p[0] - b[0]);
      if (Math.abs(cross) < 0.01) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

/**
 * A polyline with its corners rounded by up to `r` px (never more than half of either side).
 * Returns the SVG path and a dense list of points on it, for packets that must follow the curve.
 */
export function roundPath(pts: Pt[], r: number): { d: string; dense: Pt[] } {
  const p = simplify(pts);
  let d = `M${px(p[0]![0])} ${px(p[0]![1])}`;
  const dense: Pt[] = [p[0]!];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!, c = p[i]!, b = p[i + 1]!;
    const rc = Math.min(r, dist(a, c) / 2, dist(c, b) / 2);
    const ux = (c[0] - a[0]) / (dist(a, c) || 1), uy = (c[1] - a[1]) / (dist(a, c) || 1);
    const vx = (b[0] - c[0]) / (dist(c, b) || 1), vy = (b[1] - c[1]) / (dist(c, b) || 1);
    const s: Pt = [c[0] - ux * rc, c[1] - uy * rc], e: Pt = [c[0] + vx * rc, c[1] + vy * rc];
    if (rc < 0.5) { d += `L${px(c[0])} ${px(c[1])}`; dense.push(c); continue; }
    d += `L${px(s[0])} ${px(s[1])}Q${px(c[0])} ${px(c[1])} ${px(e[0])} ${px(e[1])}`;
    dense.push(s);
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, m = 1 - t;
      dense.push([m * m * s[0] + 2 * m * t * c[0] + t * t * e[0], m * m * s[1] + 2 * m * t * c[1] + t * t * e[1]]);
    }
  }
  const last = p[p.length - 1]!;
  d += `L${px(last[0])} ${px(last[1])}`;
  dense.push(last);
  return { d, dense };
}

/** Total length of a polyline. */
export const lengthOf = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1]!, p) : 0), 0);

/** The point at arc length `s` along a polyline. */
export function pointAt(pts: Pt[], s: number): Pt {
  let left = s;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1]!, pts[i]!);
    if (left <= l || i === pts.length - 1) {
      const t = l ? Math.min(1, Math.max(0, left / l)) : 1;
      const a = pts[i - 1]!, b = pts[i]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= l;
  }
  return pts[pts.length - 1]!;
}

/** The time at which an eased progress reaches `target` (0-1), by bisection. */
function timeFor(ctx: Ctx, curve: "move" | "linear", target: number) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (ease(ctx.system, curve, m) < target) lo = m; else hi = m;
  }
  return hi;
}

/**
 * x and y keys that move a dot along a polyline from t0 to t1. Progress along the line follows the
 * system's move curve (or linear when that curve overshoots), so the dot stays in step with a
 * `draw` track on the same curve. Corners get their own keys, so the dot never cuts a corner.
 */
export function travel(ctx: Ctx, pts: Pt[], t0: number, t1: number): { x: Key[]; y: Key[]; curve: "move" | "linear" } {
  const curve = ctx.noOvershoot("move") === "move" ? "move" : "linear";
  const total = lengthOf(pts) || 1;
  const fracs = new Set<number>();
  const n = 14;
  for (let k = 0; k <= n; k++) fracs.add(k / n);
  // Each vertex of the line, as a fraction of the time.
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += dist(pts[i - 1]!, pts[i]!);
    fracs.add(timeFor(ctx, curve, acc / total));
  }
  const times = [...fracs].sort((a, b) => a - b);
  const x: Key[] = [], y: Key[] = [];
  const [x0, y0] = pts[0]!;
  let prev = -1;
  for (const f of times) {
    const t = t0 + (t1 - t0) * f;
    if (t - prev < 1e-4) continue;
    prev = t;
    const [px_, py_] = pointAt(pts, total * ease(ctx.system, curve, f));
    const c = x.length ? "linear" as const : undefined;
    x.push({ t, v: px_ - x0, curve: c });
    y.push({ t, v: py_ - y0, curve: c });
  }
  return { x, y, curve };
}

/** The parts of [from, to) not covered by `holes`. */
export function complement(from: number, to: number | undefined, holes: [number, number | undefined][]): [number, number | undefined][] {
  const out: [number, number | undefined][] = [];
  let cur: number | undefined = from;
  for (const [a, b] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (cur === undefined) break;
    if (to !== undefined && a >= to) break;
    if (b !== undefined && b <= cur) continue;
    if (a > cur) out.push([cur, a]);
    cur = b;
  }
  if (cur !== undefined && (to === undefined || cur < to)) out.push([cur, to]);
  return out;
}

/** Cuts spans at `until`. */
export const clip = (list: [number, number | undefined][], until?: number): [number, number | undefined][] =>
  until === undefined ? list : list.filter(([a]) => a < until).map(([a, b]) => [a, b === undefined ? until : Math.min(b, until)]);

/**
 * Opacity keys for spans. A span that starts at `at` enters on the enter curve; one that ends at
 * `until` leaves on the exit curve. Every other change is a colour swap: a short fade on the move
 * curve (linear when the move curve overshoots). Keys always run forward in time.
 */
export function fadeKeys(ctx: Ctx, list: [number, number | undefined][], at: number, until?: number): Key[] {
  const keys: Key[] = [];
  const dX = swapDur(ctx);
  const mv = ctx.noOvershoot("move");
  const last = () => (keys.length ? keys[keys.length - 1]!.t : -Infinity);
  // Nothing shows after the block leaves: a span ends at `until` at the latest, and one that starts there is dropped.
  for (const [a0, b0] of list) {
    if (until !== undefined && a0 >= until - 1e-6) continue;
    const b = until !== undefined && (b0 === undefined || b0 > until) ? until : b0;
    const a = Math.max(a0, last());
    if (ctx.instant) keys.push(...cut(a, 0, 1));
    else if (Math.abs(a - at) < 1e-6) keys.push(...go(ctx, a, 0, 1, "enter"));
    else keys.push({ t: a, v: 0 }, { t: a + dX, v: 1, curve: mv });
    if (b === undefined) continue;
    const s = Math.max(b, last());
    if (ctx.instant) keys.push(...cut(s, 1, 0));
    else if (until !== undefined && b >= until - 1e-6) keys.push({ t: s, v: 1 }, { t: s + ctx.dur.exit, v: 0, curve: "exit" });
    else keys.push({ t: s, v: 1 }, { t: s + dX, v: 0, curve: mv });
  }
  return keys.length ? keys : [{ t: 0, v: 0 }];
}

/** How long one half of a colour swap takes. */
const swapDur = (ctx: Ctx) => ctx.dur.move * 0.35;

/**
 * Opacity keys for one copy of a label that changes colour. A span that starts at `at` enters on the
 * enter curve and one that ends at `until` leaves on the exit curve, like fadeKeys. Every other change
 * is a cut in one frame, at the middle of the fill's own fade (fadeKeys), so the label is never blank
 * and the two copies are never on screen together.
 */
function swapKeys(ctx: Ctx, list: [number, number | undefined][], at: number, until?: number): Key[] {
  const keys: Key[] = [];
  const mid = ctx.instant ? 0 : swapDur(ctx) / 2;
  const last = () => (keys.length ? keys[keys.length - 1]!.t : -Infinity);
  // Nothing comes on after the block leaves: a span that starts at `until` or later never shows.
  for (const [a0, b] of list) {
    if (until !== undefined && a0 >= until - 1e-6) continue;
    if (Math.abs(a0 - at) < 1e-6) keys.push(...go(ctx, a0, 0, 1, "enter"));
    else { const a = Math.max(a0 + mid, last()); keys.push(...cut(a, 0, 1)); }
    if (b === undefined) continue;
    if (until !== undefined && b >= until - 1e-6) { const s0 = Math.max(b, last()); keys.push({ t: s0, v: 1 }, ...go(ctx, s0, 1, 0, "exit").slice(1)); }
    else { const s0 = Math.max(b + mid, last()); keys.push(...cut(s0, 1, 0)); }
  }
  return keys.length ? keys : [{ t: 0, v: 0 }];
}

/**
 * Text that changes colour: the first colour shows outside `swaps`, the second inside them. The
 * copies cut over in one frame, at the middle of the fill's change, so the label never blinks.
 * When both colours are the same, it is one text and never swaps.
 */
export function swapText(ctx: Ctx, o: { id: string; x: number; y: number; text: string; role: TypeRole; colors: [ColorRole, ColorRole];
  at: number; until?: number; swaps: [number, number | undefined][]; y0?: Key[]; width?: number; align?: "left" | "right" | "center" }): Node[] {
  const sw = clip(o.swaps.map(([a, b]) => [Math.max(a, o.at), b] as [number, number | undefined]), o.until);
  const common = { kind: "text" as const, x: o.x, y: o.y, text: o.text, role: o.role, width: o.width, align: o.align };
  const y = o.y0 ? { y: o.y0 } : {};
  if (o.colors[0] === o.colors[1] || !sw.length) {
    return [{ ...common, id: `${o.id}-a`, color: o.colors[0], tracks: { opacity: swapKeys(ctx, [[o.at, o.until]], o.at, o.until), ...y } }];
  }
  const base = complement(o.at, o.until, sw);
  return [
    { ...common, id: `${o.id}-a`, color: o.colors[0], tracks: { opacity: swapKeys(ctx, base, o.at, o.until), ...y } },
    { ...common, id: `${o.id}-b`, color: o.colors[1], z: 1, tracks: { opacity: swapKeys(ctx, sw, o.at, o.until), ...y } },
  ];
}

/** The surface and lit fills of a node box, and the parts a block needs to draw it. */
export type NodeSpec = { id: string; x: number; y: number; w: number; h: number; lines: string[]; role: TypeRole;
  at: number; until?: number; lit: [number, number | undefined][]; align?: "center" | "left"; padX?: number };

/**
 * A labelled box: a surface rect with the system stroke and radius, an accent rect over it while lit,
 * and its label, which turns from ink to onAccent while lit. All parts enter together at `at`.
 */
export function nodeBox(ctx: Ctx, n: NodeSpec): Node[] {
  const tr = appear(ctx, n.at, n.until);
  const r = Math.min(ctx.radius, n.h / 2);
  const lit = clip(n.lit.map(([a, b]) => [Math.max(a, n.at), b] as [number, number | undefined]), n.until);
  const out: Node[] = [
    { id: `${n.id}-box`, kind: "rect", x: px(n.x), y: px(n.y), w: px(n.w), h: px(n.h), fill: "surface", stroke: "ink", strokeWidth: ctx.stroke, radius: r, tracks: tr },
  ];
  if (lit.length) out.push({ id: `${n.id}-lit`, kind: "rect", x: px(n.x), y: px(n.y), w: px(n.w), h: px(n.h), fill: "accent", radius: r, z: 1,
    tracks: { opacity: fadeKeys(ctx, lit, n.at, n.until), ...(tr.y ? { y: tr.y } : {}) } });
  const lh = ctx.lineHeight(n.role);
  // The label's ink (cap or x-height of the first line to the last baseline) is centred in the box, not its line boxes.
  const top = centreInkLines(ctx, n.lines, n.role, { y: n.y, h: n.h }, lh);
  // One label colour when ink reads (4.5:1) on both the surface and the lit fill; then nothing swaps.
  const reads = (fill: ColorRole) => contrast(colorOf(ctx.system, "ink"), colorOf(ctx.system, fill)) >= 4.5;
  const labelColors: [ColorRole, ColorRole] = lit.length && reads("surface") && reads("accent") ? ["ink", "ink"] : ["ink", "onAccent"];
  n.lines.forEach((l, k) => {
    const w = ctx.measure(l, n.role);
    const x = n.align === "left" ? n.x + (n.padX ?? 0) : n.x + (n.w - w) / 2;
    out.push(...swapText(ctx, { id: `${n.id}-t${k}`, x: px(x), y: top + k * lh, text: l, role: n.role, colors: labelColors,
      at: n.at, until: n.until, swaps: lit, y0: tr.y }));
  });
  return out;
}

/** Text boxes of every text node in a list, for the final overlap and safety checks. */
export function textBoxes(ctx: Ctx, nodes: Node[]): (Box & { id: string })[] {
  return nodes.filter((n): n is Extract<Node, { kind: "text" }> => n.kind === "text")
    .map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.width ?? ctx.measure(t.text, t.role), h: ctx.lineHeight(t.role) }));
}

const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Checks the final geometry: no two texts overlap (copies of one label at one spot are one text),
 * no line passes through a text, and every text is safe. Returns the problems found.
 */
export function audit(ctx: Ctx, nodes: Node[], lineSets: Pt[][], allowed: Box[] = [], shift: (id: string) => number = () => 0): string[] {
  // Safety is checked where each text really sits; overlaps where `shift` puts it (a block that
  // scrolls checks its rows unscrolled, because the rows only ever move together).
  const real = textBoxes(ctx, nodes);
  const boxes = real.map((b) => ({ ...b, y: b.y + shift(b.id) }));
  const problems: string[] = [];
  const same = (a: Box, b: Box) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    if (!textSafe(ctx, real[i]!)) problems.push(`${a.id} is outside the text-safe area`);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (!same(a, b) && hit(a, b)) problems.push(`${a.id} overlaps ${b.id}`);
    }
    for (const ls of lineSets) {
      if (samplePolyline(ls, 3).some(([x, y]) => x > a.x + 1 && x < a.x + a.w - 1 && y > a.y + 1 && y < a.y + a.h - 1 && !allowed.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h))) {
        problems.push(`a line crosses ${a.id}`);
        break;
      }
    }
  }
  return problems;
}

/** The block title, as lineChart sets it: label role, muted, one or two lines. Returns its nodes and height. */
export function titleOf(ctx: Ctx, id: string, title: string | undefined, x: number, y: number, w: number, at: number, until?: number): { nodes: Node[]; h: number } {
  if (!title) return { nodes: [], h: 0 };
  const ls = wrap(ctx, title, "label", w, 2) ?? [title];
  const lh = ctx.lineHeight("label");
  return { nodes: maskLines(ctx, { id: `${id}-title`, x, y, lines: ls, role: "label", color: "inkMuted", at, until }), h: lh * (ls.length + 0.9) };
}


// ---------------------------------------------------------------------------------------------
// The flow block
// ---------------------------------------------------------------------------------------------

export type FlowNode = {
  /** How edges and packets name the node. */
  id: string;
  label: string;
  /** Grid position. Columns run left to right, rows top to bottom; halves (0.5) centre a node between two. */
  col: number;
  row: number;
};
export type FlowEdge = {
  from: string; to: string;
  /** A short label beside the line. */
  label?: string;
  /** Arrowheads at both ends: a two-way link. Packets may travel it either way. */
  both?: boolean;
};
export type FlowPacket = {
  /** Node ids in order. Each pair must be joined by an edge (a `both` edge works either way). */
  path: string[];
  at: number;
  /** One sentence shown above the diagram while this packet travels. */
  label?: string;
};
export type FlowProps = {
  id?: string;
  /** The block's box in px: title, caption, nodes, lines and labels stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  packets?: FlowPacket[];
  /** "auto" (default): turn the grid when the box is taller than wide, so columns stack; if that
   *  cannot fit, keep it. "always" and "never" force one. */
  turn?: "auto" | "never" | "always";
  at: number;
  until?: number;
};

type Side = "L" | "R" | "T" | "B";
type Route = { a: number; b: number; sa: Side; sb: Side; via?: number; pts: Pt[] };

const NORMAL: Record<Side, Pt> = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
const horiz = (s: Side) => s === "L" || s === "R";

/** Does an axis-aligned segment pass through the inside of a box? */
function segHits(p: Pt, q: Pt, b: Box): boolean {
  const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
  return x0 < b.x + b.w && x1 > b.x && y0 < b.y + b.h && y1 > b.y;
}

/** Length that two axis-aligned segments share when they lie on one line (closer than `sep`). */
function shared(p: Pt, q: Pt, r: Pt, s: Pt, sep: number): number {
  const ph = Math.abs(p[1] - q[1]) < 0.01, rh = Math.abs(r[1] - s[1]) < 0.01;
  if (ph !== rh) return 0;
  if (ph) {
    if (Math.abs(p[1] - r[1]) >= sep) return 0;
    return Math.max(0, Math.min(Math.max(p[0], q[0]), Math.max(r[0], s[0])) - Math.max(Math.min(p[0], q[0]), Math.min(r[0], s[0])));
  }
  if (Math.abs(p[0] - r[0]) >= sep) return 0;
  return Math.max(0, Math.min(Math.max(p[1], q[1]), Math.max(r[1], s[1])) - Math.max(Math.min(p[1], q[1]), Math.min(r[1], s[1])));
}

/** Do two axis-aligned segments cross (one horizontal, one vertical, inside both)? */
function crosses(p: Pt, q: Pt, r: Pt, s: Pt): boolean {
  const ph = Math.abs(p[1] - q[1]) < 0.01, rh = Math.abs(r[1] - s[1]) < 0.01;
  if (ph === rh) return false;
  const [h0, h1, v0, v1] = ph ? [p, q, r, s] : [r, s, p, q];
  const x = v0[0], y = h0[1];
  return x > Math.min(h0[0], h1[0]) + 0.5 && x < Math.max(h0[0], h1[0]) - 0.5 && y > Math.min(v0[1], v1[1]) + 0.5 && y < Math.max(v0[1], v1[1]) - 0.5;
}

/** A polyline with its ends cut back by `a` px at the start and `b` px at the end (for arrowheads). */
function trim(pts: Pt[], a: number, b: number): Pt[] {
  const out = pts.map((p) => [...p] as Pt);
  const cut = (i: number, j: number, d: number) => {
    const p = out[i]!, q = out[j]!, l = dist(p, q) || 1;
    out[i] = [p[0] + ((q[0] - p[0]) / l) * Math.min(d, l - 1), p[1] + ((q[1] - p[1]) / l) * Math.min(d, l - 1)];
  };
  if (a > 0) cut(0, 1, a);
  if (b > 0) cut(out.length - 1, out.length - 2, b);
  return out;
}

type Laid = { out: Node[]; problems: string[] };

function compose(p: FlowProps, ctx: Ctx, inset: number, spread: number, turn: boolean): Laid {
  const id = p.id ?? "flow";
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label"), lhB = ctx.lineHeight("caption");
  const W = p.w - inset;
  const out: Node[] = [];
  const problems: string[] = [];
  const exit = p.until;
  const { len: aLen, half: aHalf } = arrowSize(ctx);
  const wt = weights(ctx);
  const packets = p.packets ?? [];
  const nIdx = new Map(p.nodes.map((n, i) => [n.id, i]));
  const ni = (nid: string) => {
    const i = nIdx.get(nid);
    if (i === undefined) throw new Error(`flow ${id}: no node "${nid}"`);
    return i;
  };

  // Title and the packet captions, top to bottom.
  const title = titleOf(ctx, id, p.title, p.x, p.y, W, p.at, exit);
  out.push(...title.nodes);
  const capLines = packets.map((k) => (k.label ? wrap(ctx, k.label, "caption", W, 3) ?? (problems.push(`caption "${k.label}" does not fit`), [k.label]) : []));
  const capN = Math.max(0, ...capLines.map((l) => l.length));
  const capTop = p.y + title.h;
  const capH = capN ? capN * lhB + sL * 0.9 : 0;
  const area = { x: p.x, y: capTop + capH, w: W, h: p.y + p.h - capTop - capH };

  // The grid, turned (columns become rows) when `turn` is set.
  const cr = p.nodes.map((n) => (turn ? [n.row, n.col] : [n.col, n.row]) as Pt);
  const spanC = Math.max(...cr.map((c) => c[0])), spanR = Math.max(...cr.map((c) => c[1]));
  const padX = sL * 0.75, padY = sL * 0.5;
  const gapX = Math.max(sL * 2.4, aLen * 2 + sL * 1.4) * (1 + spread), gapY = Math.max(sL * 2.2, aLen * 2 + sL * 1.2) * (1 + spread);
  const fitW = spanC > 0 ? (area.w - spanC * gapX) / (spanC + 1) : area.w;
  let labels = p.nodes.map((n) => [n.label]);
  if (widest(ctx, p.nodes.map((n) => n.label), "label") + 2 * padX > fitW) {
    labels = p.nodes.map((n) => wrap(ctx, n.label, "label", fitW - 2 * padX, 2) ?? (problems.push(`node "${n.label}" does not fit`), [n.label]));
  }
  const nodeW = Math.max(...labels.map((l) => widest(ctx, l, "label"))) + 2 * padX;
  const nodeH = Math.max(...labels.map((l) => l.length)) * lhL + 2 * padY;
  const pitchX = spanC > 0 ? Math.min((area.w - nodeW) / spanC, nodeW + gapX * 3) : 0;
  const pitchY = spanR > 0 ? Math.min((area.h - nodeH) / spanR, nodeH + gapY * 3) : 0;
  // Rows may close up to a smaller gap that still leaves room for two arrowheads and a label.
  const gapYMin = Math.max(sL * 1.7, aLen * 2 + sL * 0.9);
  if (spanR > 0 && pitchY < nodeH + gapYMin) problems.push(`the rows need ${Math.round(spanR * (nodeH + gapYMin) + nodeH - area.h)} px more height`);
  const gridW = spanC * pitchX + nodeW, gridH = spanR * pitchY + nodeH;
  const ox = area.x + (area.w - gridW) / 2, oy = area.y + (area.h - gridH) / 2;
  const boxes: Box[] = cr.map(([c, r]) => ({ x: ox + c * pitchX, y: oy + r * pitchY, w: nodeW, h: nodeH }));

  // Channels: the middle of every gap between columns and between rows.
  const chan = (vals: number[], size: number, lo: number, hi: number) => {
    const u = [...new Set(vals.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
    const c: number[] = [];
    for (let i = 1; i < u.length; i++) if (u[i]! - u[i - 1]! > size + 1) c.push((u[i - 1]! + size + u[i]!) / 2);
    c.push(u[0]! - gapX / 2, u[u.length - 1]! + size + gapX / 2);
    return c.filter((v) => v >= lo && v <= hi);
  };
  const chX = chan(boxes.map((b) => b.x), nodeW, p.x, p.x + W);
  const chY = chan(boxes.map((b) => b.y), nodeH, area.y, area.y + area.h);

  // Routing. Each edge tries straight, one-bend and two-bend routes through the channels and keeps the
  // cheapest that passes through no other node and shares no line with an edge already routed.
  const port = (i: number, s: Side, off = 0): Pt => {
    const b = boxes[i]!;
    if (s === "L") return [b.x, b.y + b.h / 2 + off];
    if (s === "R") return [b.x + b.w, b.y + b.h / 2 + off];
    if (s === "T") return [b.x + b.w / 2 + off, b.y];
    return [b.x + b.w / 2 + off, b.y + b.h];
  };
  const build = (r: Omit<Route, "pts">, offA = 0, offB = 0): Pt[] => {
    const pa = port(r.a, r.sa, offA), pb = port(r.b, r.sb, offB);
    if (horiz(r.sa) && horiz(r.sb)) return simplify([pa, [r.via!, pa[1]], [r.via!, pb[1]], pb]);
    if (!horiz(r.sa) && !horiz(r.sb)) return simplify([pa, [pa[0], r.via!], [pb[0], r.via!], pb]);
    if (horiz(r.sa)) return simplify([pa, [pb[0], pa[1]], pb]);
    return simplify([pa, [pa[0], pb[1]], pb]);
  };
  const stub = sL * 0.6, lead = aLen + sL * 0.5;
  const inflate = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
  const valid = (r: Omit<Route, "pts">, pts: Pt[], both: boolean): boolean => {
    if (pts.length < 2) return false;
    // Leave the first node outward and enter the second inward, with room for the arrowheads.
    const [p0, p1] = [pts[0]!, pts[1]!], [q1, q0] = [pts[pts.length - 2]!, pts[pts.length - 1]!];
    const na = NORMAL[r.sa], nb = NORMAL[r.sb];
    const outA = ((p1[0] - p0[0]) * na[0] + (p1[1] - p0[1]) * na[1]), inB = ((q1[0] - q0[0]) * nb[0] + (q1[1] - q0[1]) * nb[1]);
    if (outA < (both ? lead : stub) - 0.5 || inB < lead - 0.5) return false;
    if (Math.abs(dist(p0, p1) - outA) > 0.5 || Math.abs(dist(q0, q1) - inB) > 0.5) return false;
    for (let k = 1; k < pts.length; k++) {
      const s0 = pts[k - 1]!, s1 = pts[k]!;
      for (let j = 0; j < boxes.length; j++) {
        const own = j === r.a || j === r.b;
        if (own && ((j === r.a && k === 1) || (j === r.b && k === pts.length - 1))) continue;
        if (segHits(s0, s1, own ? inflate(boxes[j]!, -1) : inflate(boxes[j]!, sL * 0.35))) return false;
      }
    }
    return true;
  };
  const routes: Route[] = [];
  const pair = (e: FlowEdge, f: FlowEdge) => (e.from === f.to && e.to === f.from) || (e.from === f.from && e.to === f.to);
  p.edges.forEach((e, ei) => {
    const a = ni(e.from), b = ni(e.to);
    let best: { r: Route; cost: number } | null = null;
    const sides: Side[] = ["R", "L", "B", "T"];
    for (const sa of sides) for (const sb of sides) {
      const vias = horiz(sa) && horiz(sb) ? chX : !horiz(sa) && !horiz(sb) ? chY : [undefined];
      // A straight run needs no channel.
      const straight = horiz(sa) && horiz(sb) ? Math.abs(port(a, sa)[1] - port(b, sb)[1]) < 0.5 : !horiz(sa) && !horiz(sb) ? Math.abs(port(a, sa)[0] - port(b, sb)[0]) < 0.5 : false;
      const viaList = straight ? [(horiz(sa) ? (port(a, sa)[0] + port(b, sb)[0]) : (port(a, sa)[1] + port(b, sb)[1])) / 2] : vias;
      for (const via of viaList) {
        const base = { a, b, sa, sb, via };
        const pts = build(base);
        if (!valid(base, pts, !!e.both)) continue;
        // Prefer the sides that face each other along the main direction between the two nodes.
        const ca = boxes[a]!, cb = boxes[b]!;
        const dx = cb.x - ca.x, dy = cb.y - ca.y;
        const along: [Side, Side] = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? ["R", "L"] : ["L", "R"]) : (dy > 0 ? ["B", "T"] : ["T", "B"]);
        let cost = lengthOf(pts) + (pts.length - 2) * sL * 4 + (sa === along[0] ? 0 : sL * 8) + (sb === along[1] ? 0 : sL * 8);
        let clash = false;
        // The run that leaves or enters a node side, by node and side: two such runs at one side
        // may share a line now, because their ports move apart below.
        const endKey = (q: Pt[], k: number, r: { a: number; b: number; sa: Side; sb: Side }) => (k === 1 ? `${r.a}${r.sa}` : k === q.length - 1 ? `${r.b}${r.sb}` : null);
        routes.forEach((o, oi) => {
          const other = p.edges[oi]!;
          for (let k = 1; k < pts.length; k++) for (let m = 1; m < o.pts.length; m++) {
            const sh = shared(pts[k - 1]!, pts[k]!, o.pts[m - 1]!, o.pts[m]!, sL * 0.5);
            const ka = endKey(pts, k, base), kb = endKey(o.pts, m, o);
            // An edge and its reverse may share a run too: their ports move apart the same way.
            if (sh > 1 && !pair(e, other) && !(ka && ka === kb)) clash = true;
            if (crosses(pts[k - 1]!, pts[k]!, o.pts[m - 1]!, o.pts[m]!)) cost += sL * 8;
          }
        });
        if (clash) continue;
        if (!best || cost < best.cost - 0.01) best = { r: { ...base, pts }, cost };
      }
    }
    if (!best) { problems.push(`no route for edge ${ei}`); routes.push({ a, b, sa: "R", sb: "L", via: 0, pts: [port(a, "R"), port(b, "L")] }); }
    else routes.push(best.r);
  });

  // Ports: edges that leave or enter one side of a node spread out along it, in the order of the
  // nodes at their other ends, so lines never merge at a box.
  const offs = routes.map(() => [0, 0]);
  const users = new Map<string, { ri: number; end: 0 | 1; key: number }[]>();
  routes.forEach((r, ri) => {
    ([[r.a, r.sa, r.b], [r.b, r.sb, r.a]] as [number, Side, number][]).forEach(([n, s, o], end) => {
      const k = `${n}${s}`;
      const ob = boxes[o]!;
      const key = horiz(s) ? ob.y + ob.h / 2 : ob.x + ob.w / 2;
      users.set(k, [...(users.get(k) ?? []), { ri, end: end as 0 | 1, key: key + ri * 1e-3 }]);
    });
  });
  for (const [k, list] of users) {
    if (list.length < 2) continue;
    const s = k.slice(-1) as Side;
    const sideLen = horiz(s) ? nodeH : nodeW;
    const gap = Math.min((sideLen * 0.6) / (list.length - 1), sL * 1.1);
    list.sort((u, v) => u.key - v.key).forEach((u, j) => { offs[u.ri]![u.end] = (j - (list.length - 1) / 2) * gap; });
  }
  routes.forEach((r, ri) => { r.pts = build(r, offs[ri]![0], offs[ri]![1]); });
  // With the ports set, no two edges may share a line and no edge may cross a node.
  routes.forEach((r, ri) => {
    routes.forEach((o, oi) => {
      if (oi <= ri) return;
      for (let k = 1; k < r.pts.length; k++) for (let m = 1; m < o.pts.length; m++)
        if (shared(r.pts[k - 1]!, r.pts[k]!, o.pts[m - 1]!, o.pts[m]!, wt.lit * 2) > 1) { problems.push(`edges ${ri} and ${oi} share a line`); return; }
    });
    if (!valid(r, r.pts, !!p.edges[ri]!.both)) problems.push(`edge ${ri} runs through a node`);
  });

  // Timing: nodes in reading order, then each edge once both its ends are in.
  const t0 = p.at;
  const order = p.nodes.map((_, i) => i).sort((i, j) => p.nodes[i]!.col - p.nodes[j]!.col || p.nodes[i]!.row - p.nodes[j]!.row);
  const nodeAt = new Map(order.map((i, k) => [i, t0 + k * ctx.dur.stagger * 3]));
  const edgeAt = routes.map((r) => Math.max(nodeAt.get(r.a)!, nodeAt.get(r.b)!) + ctx.dur.enter * 0.6);
  const drawn = ctx.noOvershoot("move");
  const builtAt = Math.max(...edgeAt) + ctx.dur.move;

  // Packets: hops along edges. A hop's time grows with its length, in move durations.
  const short = Math.min(ctx.width, ctx.height);
  const lit: [number, number | undefined][][] = p.nodes.map(() => []);
  type Hop = { ri: number; fwd: boolean; t0: number; t1: number; end: number | undefined };
  const hops: Hop[] = [];
  const starts = packets.map((k) => Math.max(k.at, builtAt));
  packets.forEach((k, pi) => {
    const endOf = starts[pi + 1] ?? exit;
    let t = starts[pi]!;
    let prev = ni(k.path[0]!);
    let litFrom = t;
    for (let h = 1; h < k.path.length; h++) {
      const a = ni(k.path[h - 1]!), b = ni(k.path[h]!);
      let ri = p.edges.findIndex((e) => ni(e.from) === a && ni(e.to) === b);
      let fwd = true;
      if (ri < 0) { ri = p.edges.findIndex((e) => e.both && ni(e.from) === b && ni(e.to) === a); fwd = false; }
      if (ri < 0) throw new Error(`flow ${id}: no edge from "${k.path[h - 1]}" to "${k.path[h]}"`);
      const len = lengthOf(routes[ri]!.pts);
      const d = ctx.dur.move * Math.max(1, len / (short * 0.32));
      hops.push({ ri, fwd, t0: t, t1: t + d, end: endOf });
      lit[prev]!.push([litFrom, t + d]);
      prev = b;
      litFrom = t + d;
      t += d + ctx.dur.enter + ctx.dur.stagger * 2;
    }
    lit[prev]!.push([litFrom, endOf]);
  });

  // Nodes, each with an anchor named by its id: `<id>-node:<node id>`.
  p.nodes.forEach((nd, i) => {
    const b = boxes[i]!;
    out.push({ id: `${id}-node:${nd.id}`, kind: "anchor", x: b.x, y: b.y, w: b.w, h: b.h, at: nodeAt.get(i)! });
    out.push(...nodeBox(ctx, { id: `${id}-n${i}`, x: b.x, y: b.y, w: b.w, h: b.h, lines: labels[i]!, role: "label", at: nodeAt.get(i)!, until: exit, lit: lit[i]! }));
  });

  // Edges: the line draws from its start; the arrowheads land when it arrives.
  const cornerR = Math.min(ctx.radius, sL * 0.6);
  const tipGap = ctx.stroke * 1.5;
  const lineSets: Pt[][] = [];
  routes.forEach((r, ri) => {
    const e = p.edges[ri]!;
    const full = trim(r.pts, e.both ? tipGap : 0, tipGap);
    const body = trim(full, e.both ? aLen * 0.9 : 0, aLen * 0.9);
    const at = edgeAt[ri]!;
    const headAt = at + (ctx.instant ? 0 : ctx.dur.move * 0.85);
    out.push({ id: `${id}-e${ri}`, kind: "path", d: roundPath(body, cornerR).d, stroke: "inkMuted", width: wt.base, cap: "butt", join: "round",
      tracks: { draw: go(ctx, at, 0, 1, drawn, 1, "move"), ...appear(ctx, at, exit, 0) } });
    const tipB = full[full.length - 1]!, tipA = full[0]!;
    out.push({ id: `${id}-e${ri}-hb`, kind: "path", d: arrowHead(tipB, full[full.length - 2]!, aLen, aHalf), fill: "inkMuted", tracks: appear(ctx, headAt, exit, 0) });
    if (e.both) out.push({ id: `${id}-e${ri}-ha`, kind: "path", d: arrowHead(tipA, full[1]!, aLen, aHalf), fill: "inkMuted", tracks: appear(ctx, at, exit, 0) });
    lineSets.push(r.pts);
  });

  // Hops: the edge lights in step with the dot, then its arrowhead and the node it reaches light.
  const dotR = Math.max(sL * 0.24, wt.lit * 1.15);
  hops.forEach((hp, hi) => {
    const r = routes[hp.ri]!, e = p.edges[hp.ri]!;
    // An anchor per hop, `<id>-hop:<n>`: at the tip where the packet arrives, `at` = when it arrives.
    {
      const fullA = trim(r.pts, e.both ? tipGap : 0, tipGap);
      const tipA = (hp.fwd ? fullA[fullA.length - 1] : fullA[0])!;
      out.push({ id: `${id}-hop:${hi}`, kind: "anchor", x: tipA[0], y: tipA[1], w: 0, h: 0, at: hp.t1, data: { start: hp.t0, edge: hp.ri } });
    }
    const full = trim(r.pts, e.both ? tipGap : 0, tipGap);
    const path = hp.fwd ? full : [...full].reverse();
    const startHead = hp.fwd ? !!e.both : true;
    const body = trim(path, startHead ? aLen * 0.9 : 0, aLen * 0.9);
    const rp = roundPath(body, cornerR);
    const curve = ctx.noOvershoot("move") === "move" ? "move" as const : "linear" as const;
    const draw: Key[] = ctx.instant ? cut(hp.t1, 0, 1) : [{ t: hp.t0, v: 0 }, { t: hp.t1, v: 1, curve }];
    const on: [number, number | undefined][] = [[ctx.instant ? hp.t1 : hp.t0, hp.end]];
    out.push({ id: `${id}-h${hi}`, kind: "path", d: rp.d, stroke: "accent", width: wt.lit, cap: "butt", join: "round", z: 2,
      tracks: { draw, opacity: fadeKeys(ctx, on, on[0]![0], exit) } });
    const tip = path[path.length - 1]!;
    out.push({ id: `${id}-h${hi}-head`, kind: "path", d: arrowHead(tip, path[path.length - 2]!, aLen * 1.1, aHalf * 1.1), fill: "accent", z: 3,
      tracks: { opacity: fadeKeys(ctx, [[hp.t1, hp.end]], hp.t1, exit) } });
    if (!ctx.instant) {
      const tv = travel(ctx, rp.dense, hp.t0, hp.t1);
      const [sx, sy] = rp.dense[0]!;
      out.push({ id: `${id}-h${hi}-dot`, kind: "circle", cx: px(sx), cy: px(sy), r: dotR, fill: "accent", z: 4,
        tracks: { x: tv.x, y: tv.y, opacity: seq(go(ctx, hp.t0, 0, 1, "enter", 0.5), go(ctx, hp.t1, 1, 0, "exit")) } });
    }
  });

  // Captions: each packet's sentence holds while it travels and leaves before the next one enters.
  packets.forEach((_k, pi) => {
    if (!capLines[pi]!.length) return;
    const next = starts[pi + 1];
    const until = next !== undefined ? next - (ctx.instant ? 1 / 30 : ctx.dur.exit) - ctx.dur.stagger : exit;
    out.push(...maskLines(ctx, { id: `${id}-cap${pi}`, x: p.x, y: capTop, lines: capLines[pi]!, role: "caption", color: "ink", at: starts[pi]!, until }));
  });

  // Edge labels: each finds a free spot near the middle of its longest run.
  const labelled = p.edges.map((e, ri) => ({ e, ri })).filter((x) => x.e.label);
  let labelMiss = false;
  if (labelled.length) {
    const obstacles: Box[] = [...boxes.map((b) => inflate(b, 2)), ...textBoxes(ctx, out)];
    const points = routes.flatMap((r) => samplePolyline(r.pts, 4));
    const wants = labelled.map(({ e, ri }) => {
      const pts = routes[ri]!.pts;
      let k = 1;
      for (let j = 1; j < pts.length; j++) if (dist(pts[j - 1]!, pts[j]!) > dist(pts[k - 1]!, pts[k]!)) k = j;
      const mid: Pt = [(pts[k - 1]![0] + pts[k]![0]) / 2, (pts[k - 1]![1] + pts[k]![1]) / 2];
      const two = wrap(ctx, e.label!, "label", ctx.measure(e.label!, "label") * 0.62, 2);
      const vs = [[e.label!], ...(two && two.length === 2 ? [two] : [])];
      return { vs, want: { variants: vs.map((ls) => ({ w: widest(ctx, ls, "label"), h: ls.length * lhL })), anchor: mid, gap: sL * 0.5 } };
    });
    const placed = placeLabels(wants.map((w) => w.want), { x: p.x, y: area.y, w: W, h: area.h }, obstacles, points, wt.lit + 4, (b) => textSafe(ctx, b));
    placed.forEach((pl, k) => {
      if (!pl) { labelMiss = true; return; }
      const ls = wants[k]!.vs[pl.variant]!;
      const at = edgeAt[labelled[k]!.ri]! + ctx.dur.move;
      ls.forEach((l, j) => out.push({ id: `${id}-el${k}-${j}`, kind: "text", x: px(pl.box.x), y: px(pl.box.y + j * lhL), text: l, role: "label", color: "inkMuted",
        tracks: appear(ctx, at + j * ctx.dur.stagger, exit, 0) }));
    });
    if (labelMiss) problems.push("an edge label found no free spot");
  }

  problems.push(...audit(ctx, out, lineSets));
  return { out, problems };
}

/**
 * Lays the diagram out on the full box first, turned when the box is portrait. When an edge label
 * finds no spot, the gaps between nodes widen; when a text box leaves the text-safe area, the layout
 * narrows; when nothing works, the other orientation is tried. The first layout with no problem wins.
 */
export const flow: Block<FlowProps> = (p, ctx) => tagParts(drawFlow(textSafeBox(ctx, p, `flow ${p.id ?? "flow"}`, "give the lower band to a picture, or use steps"), ctx), p.id ?? "flow", GESTURES.flow!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawFlow: Block<FlowProps> = (p, ctx) => {
  let best: Laid | null = null;
  const turns = p.turn === "always" ? [true] : p.turn === "never" ? [false] : p.h > p.w ? [true, false] : [false, true];
  for (const turn of turns) for (const spread of [0, 0.5, 1]) for (const f of [0, 0.05, 0.1, 0.15, 0.2]) {
    const r = compose(p, ctx, p.w * f, spread, turn);
    if (!r.problems.length) return r.out;
    if (!best || r.problems.length < best.problems.length) best = r;
  }
  console.warn(`flow ${p.id ?? "flow"}: ${best!.problems.join("; ")}`);
  return best!.out;
};
