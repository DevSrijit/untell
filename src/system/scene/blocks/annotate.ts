// Annotate: a label with an arrow that points at a target box (a word, a number, a mark).
//
// Rules this block enforces:
// - The label places itself. It tries spots on each side of the target (the preferred side first),
//   nearest first, as one line and then as two. A spot is free when the label is inside the search
//   area, passes textSafe, keeps clear of the target, of every obstacle box and of every point the
//   scene gives (other leaders), and the leader from it touches none of them and no label text. If no spot is free, the block draws
//   nothing and warns: it never draws text over text.
// - The leader is a straight or gently curved line with an open arrowhead. It stops short of the
//   label and of the target, so it never touches their ink.
// - The leader draws on a curve that does not overshoot, after the label is in.
// - Meaning does not ride on colour: the arrow and the words carry it.
import { appear, go, lines, px, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node } from "../types";
import { safeBox } from "./rows";
import { twoLines, type Box } from "./util";

export type AnnotateProps = {
  id?: string;
  /** What the arrow points at, in px. A point is a box of zero size. */
  target: Box;
  label: string;
  /** Default "label". */
  role?: "label" | "caption";
  /** Label colour. Default ink. */
  color?: ColorRole;
  /** Leader and arrowhead colour. Default ink. */
  stroke?: ColorRole;
  /** The side to try first. Default "above". */
  prefer?: "above" | "below" | "left" | "right";
  /** Boxes the label and leader must keep clear of: other text, marks, other labels. */
  obstacles?: Box[];
  /** Points to keep clear of: other leaders (see AnnotateLayout.points), lines of a chart. */
  points?: [number, number][];
  /** Where the label may go. Default: the text-safe area. */
  within?: Box;
  /** How much the leader curves, as a fraction of its length. 0 is straight. Default 0.18. */
  bend?: number;
  at: number;
  until?: number;
};

export type AnnotateLayout = { label: Box; lines: string[]; d: string; head: string; ok: boolean; /** Points along the leader, for the next annotation to keep clear of. */ points: [number, number][] };

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (b: Box, g: number): Box => ({ x: b.x - g, y: b.y - g, w: b.w + 2 * g, h: b.h + 2 * g });
const nearest = (b: Box, x: number, y: number): [number, number] => [Math.max(b.x, Math.min(x, b.x + b.w)), Math.max(b.y, Math.min(y, b.y + b.h))];

/** Finds the label's spot and the leader's path. Use it to add this label to the next one's obstacles. */
export function annotateLayout(p: AnnotateProps, ctx: Ctx): AnnotateLayout {
  const role = p.role ?? "label";
  const s = ctx.size(role), lh = ctx.lineHeight(role);
  const within = p.within ?? safeBox(ctx);
  const t = p.target;
  const tc: [number, number] = [t.x + t.w / 2, t.y + t.h / 2];
  const pad = s * 0.35; // air around every obstacle
  const startGap = s * 0.3, endGap = s * 0.3;
  const head = Math.max(s * 0.32, ctx.stroke * 4);
  const minLen = head * 2.6;
  const blocks = [grow(t, pad), ...(p.obstacles ?? []).map((o) => grow(o, pad))];
  const variants = [[p.label], ...(twoLines(p.label) ? [twoLines(p.label)!] : [])];
  const sides = ["above", "below", "right", "left"] as const;
  const order = [p.prefer ?? "above", ...sides.filter((x) => x !== (p.prefer ?? "above"))];
  const bend = p.bend ?? 0.18;

  const leader = (lab: Box) => {
    // From the label edge facing the target to the target edge facing the label.
    const [sx0, sy0] = nearest(lab, tc[0], tc[1]);
    const [ex0, ey0] = nearest(t, sx0, sy0);
    const dx = ex0 - sx0, dy = ey0 - sy0, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const a: [number, number] = [sx0 + ux * startGap, sy0 + uy * startGap];
    const b: [number, number] = [ex0 - ux * endGap, ey0 - uy * endGap];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Bow the curve to the side away from the target's centre line, so it reads as a gesture.
    const nx = -uy, ny = ux;
    const sgn = (lab.x + lab.w / 2 - tc[0]) * ny - (lab.y + lab.h / 2 - tc[1]) * nx >= 0 ? 1 : -1;
    const c: [number, number] = [(a[0] + b[0]) / 2 + nx * bend * len * sgn, (a[1] + b[1]) / 2 + ny * bend * len * sgn];
    return { a, b, c, len };
  };
  const along = (l: ReturnType<typeof leader>, k: number): [number, number] => {
    const u = 1 - k;
    return [u * u * l.a[0] + 2 * u * k * l.c[0] + k * k * l.b[0], u * u * l.a[1] + 2 * u * k * l.c[1] + k * k * l.b[1]];
  };

  for (const ls of variants) {
    const w = Math.max(...ls.map((x) => ctx.measure(x, role))), h = lh * ls.length;
    for (const side of order) {
      // Every spot on this side, at every distance, nearest to the target first: a label stays close
      // and over its target before it moves out sideways.
      const cands: Box[] = [];
      for (const ring of [1, 1.6, 2.4, 3.4, 4.6]) {
        const d = s * 1.2 * ring;
        if (side === "above" || side === "below") {
          const y = side === "above" ? t.y - d - h : t.y + t.h + d;
          for (const x of [tc[0] - w / 2, t.x, t.x + t.w - w, t.x + t.w + d * 0.5, t.x - d * 0.5 - w, within.x, within.x + within.w - w]) cands.push({ x, y, w, h });
        } else {
          const x = side === "right" ? t.x + t.w + d : t.x - d - w;
          for (const y of [tc[1] - h / 2, t.y - h, t.y + t.h]) cands.push({ x, y, w, h });
        }
      }
      const dist = (b: Box) => Math.hypot(b.x + b.w / 2 - tc[0], b.y + b.h / 2 - tc[1]);
      cands.sort((p, q) => dist(p) - dist(q));
      for (const b of cands) {
        const box = { x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h };
        if (box.x < within.x || box.y < within.y || box.x + box.w > within.x + within.w || box.y + box.h > within.y + within.h) continue;
        if (!textSafe(ctx, box)) continue;
        if (blocks.some((o) => hits(box, o))) continue;
        const pts = p.points ?? [];
        const g = grow(box, pad);
        if (pts.some(([x, y]) => x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h)) continue;
        const l = leader(box);
        if (l.len < minLen) continue;
        // The leader stays clear of the obstacles and of this label (its own ends excepted).
        let bad = false;
        for (let k = 0.04; k <= 0.96 && !bad; k += 0.04) {
          const [x, y] = along(l, k);
          bad = (p.obstacles ?? []).some((o) => x > o.x - 2 && x < o.x + o.w + 2 && y > o.y - 2 && y < o.y + o.h + 2)
            || (x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h)
            || (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h)
            || pts.some(([qx, qy]) => Math.abs(qx - x) < pad && Math.abs(qy - y) < pad);
        }
        if (bad) continue;
        const [hx, hy] = [l.b[0] - l.c[0], l.b[1] - l.c[1]];
        const hl = Math.hypot(hx, hy) || 1, ang = 0.5;
        const back = (r: number): string => {
          const cx = Math.cos(r), sn = Math.sin(r), vx = -hx / hl, vy = -hy / hl;
          return `${px(l.b[0] + (vx * cx - vy * sn) * head)} ${px(l.b[1] + (vx * sn + vy * cx) * head)}`;
        };
        const points: [number, number][] = [];
        for (let k = 0; k <= 1.0001; k += 0.05) points.push(along(l, k));
        return {
          label: box, lines: ls, ok: true, points,
          d: `M${px(l.a[0])} ${px(l.a[1])}Q${px(l.c[0])} ${px(l.c[1])} ${px(l.b[0])} ${px(l.b[1])}`,
          head: `M${back(ang)}L${px(l.b[0])} ${px(l.b[1])}L${back(-ang)}`,
        };
      }
    }
  }
  return { label: { x: 0, y: 0, w: 0, h: 0 }, lines: [], d: "", head: "", ok: false, points: [] };
}

/** The whole annotate (the mark, its value or label and its leader) enters as one gesture: one group, `<id>` (hand.ts). */
export const annotate: Block<AnnotateProps> = (p, ctx) => drawAnnotate(p, ctx).map((n) => (n.kind === "audio" || n.group ? n : { ...n, group: p.id ?? "note" }));

const drawAnnotate: Block<AnnotateProps> = (p, ctx) => {
  const id = p.id ?? "note";
  const L = annotateLayout(p, ctx);
  if (!L.ok) {
    console.warn(`annotate ${id}: no free spot for "${p.label}"; it was left out`);
    return [];
  }
  const role = p.role ?? "label";
  const stroke = p.stroke ?? "ink";
  const w = ctx.stroke * (ctx.stroke >= 4 ? 0.75 : 1);
  const drawAt = p.at + ctx.dur.stagger * (L.lines.length + 1);
  const drawLen = ctx.instant ? 1 / 30 : ctx.dur.move;
  const out: Node[] = [
    ...lines(ctx, { id: `${id}-lab`, x: L.label.x, y: L.label.y, lines: L.lines, role, color: p.color ?? "ink", at: p.at, until: p.until }),
    { id: `${id}-lead`, kind: "path", d: L.d, stroke, width: w, cap: "round", join: "round",
      tracks: { ...appear(ctx, drawAt, p.until, 0), draw: go(ctx, drawAt, 0, 1, ctx.noOvershoot("move")) } },
    { id: `${id}-head`, kind: "path", d: L.head, stroke, width: w, cap: "round", join: "round",
      tracks: { ...appear(ctx, drawAt + drawLen * 0.85, p.until, 0), draw: go(ctx, drawAt + drawLen * 0.85, 0, 1, ctx.noOvershoot("enter")) } },
  ];
  // An annotation points at other content, so it draws in the overlay layer, above any panel or box.
  return out.map((n) => ({ ...n, layer: 1 }));
};
