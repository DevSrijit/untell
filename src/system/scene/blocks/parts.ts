// Parts: the points of a drawn shape, and where a point goes when its shape moves or turns. A mechanism is made of
// parts that rest on each other (a beam on a fulcrum, a load on the beam's end). These helpers let a scene name a
// point of a part, find it at any time, and give a follower the keys that keep it on that point.
//
// - A point of a shape is a named point of its drawn outline ("apex", "base", "top-right", ...), a pair of fractions of
//   its box ([0, 0] is the top-left corner, [1, 1] the bottom-right), or a point in px.
// - The named points follow the outline that `shape` draws. An equilateral triangle is √3/2 of its side tall and sits
//   in the middle of its square box: a gap of (1 - √3/2) / 2 of the side (about 6.7 %) stays above the apex and under
//   the base. So "apex" and "base" are not the box's top and bottom. Take them from pointOf, never from the box.
// - A turn or a move tweens on the system's curves. A point on a turning part moves on an arc, so followPoint samples
//   it on each frame of the motion and gives linear keys between the frames; the follower is on the point at every
//   frame in both renderers.
import { FPS } from "../context";
import { evaluate } from "../time";
import type { AnchorNode, Ctx, Key, Node, PathNode } from "../types";
import type { Follow } from "./callout";
import type { Box } from "./util";

/** A named point of a shape's drawn outline. */
export type PointName = "centre" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "apex" | "base";
/** A point of a shape: a named point, fractions of its box ([0, 0] top-left, [1, 1] bottom-right), or a point in px. */
export type ShapePoint = PointName | [number, number] | { x: number; y: number };

/** What a shape block says about itself (its anchor `<id>-shape`): the kind, the drawn box, the node that carries its tracks. */
export type ShapeInfo = { id: string; kind: string; box: Box; node: PathNode; origin: [number, number] };

/** The shape of a list of nodes (the nodes a `shape` call returned). Throws when the list holds no shape. */
export function shapeOf(part: Node[]): ShapeInfo {
  const a = part.find((n): n is AnchorNode => n.kind === "anchor" && n.id.endsWith("-shape") && n.data?.node !== undefined);
  if (!a) throw new Error(`no shape in these nodes: give the nodes that B.shape returned (ids: ${part.map((n) => n.id).slice(0, 6).join(", ")})`);
  const node = part.find((n): n is PathNode => n.kind === "path" && n.id === a.data!.node);
  if (!node || !node.box) throw new Error(`shape ${a.id}: its outline node ${String(a.data!.node)} is not in these nodes`);
  return { id: a.id.slice(0, -"-shape".length), kind: String(a.data!.kind), box: { x: a.x, y: a.y, w: a.w, h: a.h }, node, origin: node.origin ?? [0.5, 0.5] };
}

/** The corners of the outline a shape draws, in px at rest (a rect, a square, a triangle). A circle has none. */
export function outlineOf(kind: string, box: Box): [number, number][] | null {
  if (kind === "triangle") {
    const th = (box.w * Math.sqrt(3)) / 2, top = box.y + (box.h - th) / 2;
    return [[box.x + box.w / 2, top], [box.x + box.w, top + th], [box.x, top + th]];
  }
  if (kind === "rect" || kind === "square") return [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]];
  return null;
}

/** A named point (or fractions, or px) on a shape of this kind and drawn box, at rest. */
export function pointIn(kind: string, box: Box, at: ShapePoint): { x: number; y: number } {
  if (!Array.isArray(at) && typeof at === "object") return { x: at.x, y: at.y };
  if (Array.isArray(at)) return { x: box.x + box.w * at[0], y: box.y + box.h * at[1] };
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  if (kind === "triangle") {
    const [apex, br, bl] = outlineOf(kind, box) as [[number, number], [number, number], [number, number]];
    const mid = (a: [number, number], b: [number, number]) => ({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 });
    const named: Record<PointName, { x: number; y: number }> = {
      centre: { x: cx, y: cy }, apex: { x: apex[0], y: apex[1] }, top: { x: apex[0], y: apex[1] },
      base: mid(bl, br), bottom: mid(bl, br), "bottom-left": { x: bl[0], y: bl[1] }, "bottom-right": { x: br[0], y: br[1] },
      left: mid(apex, bl), right: mid(apex, br), "top-left": mid(apex, bl), "top-right": mid(apex, br),
    };
    return named[at];
  }
  if (kind === "circle" || kind === "sector") {
    const r = box.w / 2, d = r / Math.SQRT2;
    const named: Record<PointName, { x: number; y: number }> = {
      centre: { x: cx, y: cy }, top: { x: cx, y: cy - r }, apex: { x: cx, y: cy - r }, bottom: { x: cx, y: cy + r }, base: { x: cx, y: cy + r },
      left: { x: cx - r, y: cy }, right: { x: cx + r, y: cy }, "top-left": { x: cx - d, y: cy - d }, "top-right": { x: cx + d, y: cy - d },
      "bottom-left": { x: cx - d, y: cy + d }, "bottom-right": { x: cx + d, y: cy + d },
    };
    return named[at];
  }
  const f: Record<PointName, [number, number]> = {
    centre: [0.5, 0.5], top: [0.5, 0], apex: [0.5, 0], bottom: [0.5, 1], base: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
    "top-left": [0, 0], "top-right": [1, 0], "bottom-left": [0, 1], "bottom-right": [1, 1],
  };
  return { x: box.x + box.w * f[at][0], y: box.y + box.h * f[at][1] };
}

/** The distance in px from a point to the outline a shape draws (its edges, or its circle). Infinity for a sector. */
export function offOutline(kind: string, box: Box, p: { x: number; y: number }): number {
  if (kind === "circle") return Math.abs(Math.hypot(p.x - (box.x + box.w / 2), p.y - (box.y + box.h / 2)) - box.w / 2);
  const c = outlineOf(kind, box);
  if (!c) return Infinity;
  let best = Infinity;
  c.forEach((a, i) => {
    const b = c[(i + 1) % c.length]!;
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
    const u = Math.max(0, Math.min(1, ((p.x - a[0]) * vx + (p.y - a[1]) * vy) / L2));
    best = Math.min(best, Math.hypot(p.x - (a[0] + u * vx), p.y - (a[1] + u * vy)));
  });
  return best;
}

/** A point of a part (the nodes a `shape` call returned), at rest: where the scene drew it. */
export function pointOf(part: Node[], at: ShapePoint): { x: number; y: number } {
  const s = shapeOf(part);
  return pointIn(s.kind, s.box, at);
}

/** Where a point in px goes under a node's tracks at time t: translate, then turn and scale about the node's origin. */
export function moved(ctx: Ctx, n: PathNode, p: { x: number; y: number }, t: number): { x: number; y: number } {
  const v = evaluate(ctx.system, n.tracks, t);
  const b = n.box!, o = n.origin ?? [0.5, 0.5];
  const ox = b.x + b.w * o[0], oy = b.y + b.h * o[1];
  const r = (v.rotate * Math.PI) / 180, sx = v.scale * v.scaleX, sy = v.scale * v.scaleY;
  const dx = (p.x - ox) * sx, dy = (p.y - oy) * sy;
  return { x: ox + v.x + dx * Math.cos(r) - dy * Math.sin(r), y: oy + v.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

/** A point of a part at time t, after its moves and turns. */
export function pointAt(ctx: Ctx, part: Node[], at: ShapePoint, t: number): { x: number; y: number } {
  const s = shapeOf(part);
  return moved(ctx, s.node, pointIn(s.kind, s.box, at), t);
}

/** The spans of time in which a node's place, turn or scale changes (merged, in time order). */
export function motionSpans(n: { tracks?: Node["tracks"] }): [number, number][] {
  const spans: [number, number][] = [];
  for (const p of ["x", "y", "rotate", "scale", "scaleX", "scaleY"] as const) {
    const k = n.tracks?.[p] ?? [];
    for (let i = 1; i < k.length; i++) if (k[i]!.v !== k[i - 1]!.v && k[i]!.t > k[i - 1]!.t) spans.push([k[i - 1]!.t, k[i]!.t]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], s[1]); else out.push([...s]);
  }
  return out;
}

/** Times to sample a motion at: each frame inside each span, and each span's ends. */
export function motionTimes(spans: [number, number][]): number[] {
  const ts: number[] = [];
  for (const [a, b] of spans) {
    ts.push(a);
    for (let f = Math.floor(a * FPS) + 1; f / FPS < b - 1e-9; f++) ts.push(f / FPS);
    ts.push(b);
  }
  return [...new Set(ts.map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b);
}

/**
 * The x and y keys that keep a follower on a point of a part while the part moves and turns: the point's offset from
 * where it rests, on each frame of the part's motion, with linear keys between frames. Give them to `follow` (callout,
 * dimension, arrow) or let `shape`'s `on` take them. A part that never moves gives no keys.
 */
export function followPoint(ctx: Ctx, part: Node[], at: ShapePoint): Follow {
  const s = shapeOf(part);
  const p = pointIn(s.kind, s.box, at);
  const ts = motionTimes(motionSpans(s.node));
  if (!ts.length) return {};
  const xs: Key[] = [], ys: Key[] = [];
  for (const t of ts) {
    const q = moved(ctx, s.node, p, t);
    xs.push({ t, v: Math.round((q.x - p.x) * 100) / 100, ...(xs.length ? { curve: "linear" as const } : {}) });
    ys.push({ t, v: Math.round((q.y - p.y) * 100) / 100, ...(ys.length ? { curve: "linear" as const } : {}) });
  }
  return { x: xs, y: ys };
}

/** The box a node covers over the whole film: its drawn box (or its path's extent) at every place it passes. */
export function sweptBox(ctx: Ctx, n: Node): Box | null {
  let corners: { x: number; y: number }[] = [];
  let pad = 0;
  if (n.kind === "path") {
    const b = n.box ?? pathBox(n.d);
    if (!b) return null;
    corners = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }];
    pad = (n.width ?? 0) / 2;
  } else if (n.kind === "circle") {
    corners = [{ x: n.cx - n.r, y: n.cy - n.r }, { x: n.cx + n.r, y: n.cy + n.r }, { x: n.cx - n.r, y: n.cy + n.r }, { x: n.cx + n.r, y: n.cy - n.r }];
    pad = (n.width ?? 0) / 2;
  } else if (n.kind === "rect") {
    corners = [{ x: n.x, y: n.y }, { x: n.x + n.w, y: n.y + n.h }, { x: n.x, y: n.y + n.h }, { x: n.x + n.w, y: n.y }];
  } else return null;
  const ts = [0, ...motionTimes(motionSpans(n))];
  const node: PathNode = n.kind === "path" && n.box ? n : { id: n.id, kind: "path", d: "", box: boxOf(corners), tracks: n.tracks, origin: n.origin };
  const pts = ts.flatMap((t) => corners.map((c) => moved(ctx, node, c, t)));
  const b = boxOf(pts);
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

/** The box of a set of points. */
export function boxOf(pts: { x: number; y: number }[]): Box {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The points of an SVG arc from (x1, y1) with radii rx ry, the x-axis turn phi (degrees), the two flags and its end
 * (x2, y2): the SVG endpoint form turned into its centre form (SVG 1.1, appendix F.6), sampled `n` steps, end included.
 */
export function arcPoints(x1: number, y1: number, rx: number, ry: number, phi: number, large: number, sweep: number, x2: number, y2: number, n = 16): { x: number; y: number }[] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [{ x: x2, y: y2 }];
  const f = (phi * Math.PI) / 180, cf = Math.cos(f), sf = Math.sin(f);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cf * dx + sf * dy, yp = -sf * dx + cf * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = cf * cxp - sf * cyp + (x1 + x2) / 2, cy = sf * cxp + cf * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const out: { x: number; y: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push({ x: cf * ex - sf * ey + cx, y: sf * ex + cf * ey + cy });
  }
  return out;
}

/**
 * The polylines that an SVG path in absolute commands (M L H V Q C A Z) draws: each sub-path as a list of points, with
 * curves and arcs sampled. A stroke is these lines; `figure` keeps labels clear of them, not only of their boxes.
 */
export function pathPolylines(d: string): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (const m of d.matchAll(/([MLHVQCAZ])([^MLHVQCAZ]*)/gi)) {
    const c = m[1]!.toUpperCase();
    const v = (m[2]!.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    if (c === "M") { flush(); for (let i = 0; i + 1 < v.length; i += 2) { cx = v[i]!; cy = v[i + 1]!; if (i === 0) { sx = cx; sy = cy; } cur.push({ x: cx, y: cy }); } }
    else if (c === "L") for (let i = 0; i + 1 < v.length; i += 2) { cx = v[i]!; cy = v[i + 1]!; cur.push({ x: cx, y: cy }); }
    else if (c === "H") for (const x of v) { cx = x; cur.push({ x: cx, y: cy }); }
    else if (c === "V") for (const y of v) { cy = y; cur.push({ x: cx, y: cy }); }
    else if (c === "Q" || c === "C") {
      const step = c === "Q" ? 4 : 6;
      for (let i = 0; i + step - 1 < v.length; i += step) {
        const p = [{ x: cx, y: cy }];
        for (let j = 0; j < step; j += 2) p.push({ x: v[i + j]!, y: v[i + j + 1]! });
        for (let k = 1; k <= 12; k++) {
          const t = k / 12, u = 1 - t;
          const q = c === "Q" ? { x: u * u * p[0]!.x + 2 * u * t * p[1]!.x + t * t * p[2]!.x, y: u * u * p[0]!.y + 2 * u * t * p[1]!.y + t * t * p[2]!.y }
            : { x: u ** 3 * p[0]!.x + 3 * u * u * t * p[1]!.x + 3 * u * t * t * p[2]!.x + t ** 3 * p[3]!.x, y: u ** 3 * p[0]!.y + 3 * u * u * t * p[1]!.y + 3 * u * t * t * p[2]!.y + t ** 3 * p[3]!.y };
          cur.push(q);
        }
        cx = p[p.length - 1]!.x; cy = p[p.length - 1]!.y;
      }
    } else if (c === "A") {
      for (let i = 0; i + 6 < v.length; i += 7) { cur.push(...arcPoints(cx, cy, v[i]!, v[i + 1]!, v[i + 2]!, v[i + 3]!, v[i + 4]!, v[i + 5]!, v[i + 6]!)); cx = v[i + 5]!; cy = v[i + 6]!; }
    } else if (c === "Z") { cur.push({ x: sx, y: sy }); cx = sx; cy = sy; flush(); }
    if (c !== "M" && !cur.length) cur.push({ x: cx, y: cy });
  }
  flush();
  return out;
}

/** The extent of an SVG path in absolute commands (M L H V Q C A Z; an arc counts its whole sweep, a curve its samples), or null. */
export function pathBox(d: string): Box | null {
  const pts = pathPolylines(d).flat();
  if (!pts.length) {
    const m = d.match(/M\s*(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/i);
    return m ? { x: Number(m[1]), y: Number(m[2]), w: 0, h: 0 } : null;
  }
  return boxOf(pts);
}

/**
 * The strokes of a drawn node as segments, px, at every place it passes over the film (each frame of its motion): a
 * path's lines (curves and arcs sampled), a circle's outline, a rect's four edges. A part that draws on or changes
 * length counts with its whole path.
 */
export function strokesOf(ctx: Ctx, n: Node): [[number, number], [number, number]][] {
  return timedStrokes(ctx, n).map((q) => q.s);
}

/** The strokes of a drawn node as strokesOf gives them, each with the film time of its place. */
export function timedStrokes(ctx: Ctx, n: Node): { t: number; s: [[number, number], [number, number]] }[] {
  let lines: { x: number; y: number }[][] = [];
  if (n.kind === "path") lines = pathPolylines(n.d);
  else if (n.kind === "circle") {
    const k = Math.max(16, Math.ceil((2 * Math.PI * n.r) / 8));
    lines = [Array.from({ length: k + 1 }, (_, i) => ({ x: n.cx + n.r * Math.cos((2 * Math.PI * i) / k), y: n.cy + n.r * Math.sin((2 * Math.PI * i) / k) }))];
  } else if (n.kind === "rect") lines = [[{ x: n.x, y: n.y }, { x: n.x + n.w, y: n.y }, { x: n.x + n.w, y: n.y + n.h }, { x: n.x, y: n.y + n.h }, { x: n.x, y: n.y }]];
  else return [];
  const pts = lines.flat();
  if (!pts.length) return [];
  const box = n.kind === "path" && n.box ? n.box : boxOf(pts);
  const moving = motionSpans(n).length > 0;
  const node: PathNode = { id: n.id, kind: "path", d: "", box, tracks: n.tracks, origin: n.origin };
  // The places to sample: at rest, and on every 3rd frame of the motion (with each span's ends).
  const ts = [0, ...motionTimes(motionSpans(n)).filter((_, i, a) => i % 3 === 0 || i === a.length - 1)];
  const out: { t: number; s: [[number, number], [number, number]] }[] = [];
  // A part that never moves is one place for the whole film (time -1: every time).
  for (const t of moving ? ts : [0]) for (const l of lines) {
    const q = !n.tracks ? l : l.map((p) => moved(ctx, node, p, t));
    for (let i = 1; i < q.length; i++) out.push({ t: moving ? t : -1, s: [[q[i - 1]!.x, q[i - 1]!.y], [q[i]!.x, q[i]!.y]] });
  }
  return out;
}

/**
 * The box (x, y, w, h) that puts a named point of a shape on a given place: boxAt("triangle", { w: s, h: s }, "apex",
 * beamFoot) stands a fulcrum's apex on the underside of a beam, with no inset to compute. A circle, a square and a
 * triangle draw in the square of the box's smaller side, centred in the box.
 */
export function boxAt(kind: "circle" | "square" | "rect" | "triangle" | "sector", size: { w: number; h: number }, at: ShapePoint, place: { x: number; y: number }): Box {
  const s = Math.min(size.w, size.h);
  const drawn = kind === "rect" ? { x: 0, y: 0, w: size.w, h: size.h } : { x: (size.w - s) / 2, y: (size.h - s) / 2, w: s, h: s };
  const p = pointIn(kind, drawn, at);
  return { x: place.x - p.x, y: place.y - p.y, w: size.w, h: size.h };
}
