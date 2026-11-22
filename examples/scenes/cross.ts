// The cross scene: the centroid of a triangle. + marks register the three corners; the three
// medians (dashed) meet at one point, the centroid G, marked with a heavier +. G is the mean of
// the corners, and it cuts each median 2 : 1 from the corner.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { overflow } from "../../src/system/scene/blocks/text";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = S.right - S.left;
  const tall = ctx.height > ctx.width;
  const lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  const gap = Math.round(ctx.size("label") * 0.6);
  // The figure's box, with room round it for the corner labels.
  const pad = lhL + gap * 2;
  const box = tall
    ? { x: S.left + pad, y: S.top + lhC * 2 + pad, w: W - pad * 2, h: S.bottom - S.top - lhC * 2 - pad * 2 }
    : { x: S.left + pad, y: S.top + pad, w: W * 0.55 - pad * 2, h: S.bottom - S.top - pad * 2 };
  const P = (u: number, v: number): [number, number] => [Math.round(box.x + u * box.w), Math.round(box.y + v * box.h)];
  // At 9:16, B stays above the low band, so its label can sit right of it.
  const pts = tall ? { A: P(0, 1), B: P(1, 0.38), C: P(0.22, 0) } : { A: P(0, 1), B: P(1, 0.82), C: P(0.28, 0) };
  const names = ["A", "B", "C"] as const;
  const gx = (pts.A[0] + pts.B[0] + pts.C[0]) / 3, gy = (pts.A[1] + pts.B[1] + pts.C[1]) / 3;
  const mid = (p: readonly [number, number], q: readonly [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
  const out: Node[] = [];

  // Corners: a + mark each, then the sides draw.
  names.forEach((n, i) => out.push(...B.cross({ id: `mark-${n}`, x: pts[n][0], y: pts[n][1], at: 0.3 + i * 0.15 }, ctx)));
  names.forEach((n, i) => {
    const q = pts[names[(i + 1) % 3]!];
    out.push(...B.rule({ id: `side-${n}`, x1: pts[n][0], y1: pts[n][1], x2: q[0], y2: q[1], color: "ink", at: 0.8 + i * 0.15 }, ctx));
  });
  // Corner labels stand off each corner, away from G.
  const label = (id: string, t: string, ax: number, ay: number, ux: number, uy: number, at: number, r: number) => {
    const w = ctx.measure(t, "label"), len = Math.hypot(ux, uy) || 1;
    const dx = ux / len, dy = uy / len;
    const off = r + Math.abs(dx) * (w / 2) + Math.abs(dy) * (lhL / 2);
    return B.text({ id, text: t, role: "label", x: Math.round(ax + dx * off - w / 2), y: Math.round(ay + dy * off - lhL / 2), at }, ctx);
  };
  names.forEach((n, i) => out.push(...label(`name-${n}`, n, pts[n][0], pts[n][1], pts[n][0] - gx, pts[n][1] - gy, 1.2 + i * 0.1, gap)));

  // Medians: corner to the middle of the opposite side, dashed, one after another.
  names.forEach((n, i) => {
    const m = mid(pts[names[(i + 1) % 3]!], pts[names[(i + 2) % 3]!]);
    out.push(...B.rule({ id: `median-${n}`, x1: pts[n][0], y1: pts[n][1], x2: Math.round(m[0]), y2: Math.round(m[1]), color: "inkMuted", dash: true, at: 1.8 + i * 0.35 }, ctx));
  });

  // G: a heavier, larger + where the medians meet. Its label takes the direction furthest from all six median rays.
  const size = Math.round((36 * Math.min(ctx.width, ctx.height)) / 1080);
  out.push(...B.cross({ id: "mark-G", x: Math.round(gx), y: Math.round(gy), size, weight: 2, at: 3.2 }, ctx));
  const rays = names.flatMap((n) => { const a = Math.atan2(pts[n][1] - gy, pts[n][0] - gx); return [a, a + Math.PI]; });
  const dist = (a: number) => Math.min(...rays.map((r) => { const d = Math.abs(((a - r) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return d; }));
  const best = Array.from({ length: 16 }, (_, k) => (k / 16) * 2 * Math.PI).reduce((a, b) => (dist(b) > dist(a) ? b : a));
  out.push(...label("name-G", "G", gx, gy, Math.cos(best), Math.sin(best), 3.4, size / 2 + gap));

  const note = tall ? { x: S.left, y: S.top + overflow(ctx, "caption").top } : { x: Math.round(S.left + W * 0.62), y: Math.round((S.top + S.bottom) / 2 - lhC) };
  out.push(...B.text({ id: "note", text: "The medians meet at G.", role: "caption", x: note.x, y: note.y, at: 3.8 }, ctx));
  out.push(...B.text({ id: "mean", text: "G = (A + B + C) ÷ 3", role: "label", color: "inkMuted", x: note.x, y: note.y + lhC + gap / 2, at: 4.2 }, ctx));
  return out;
};
