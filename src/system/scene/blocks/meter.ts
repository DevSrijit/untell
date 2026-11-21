// Meter: progress toward a target, as a bar or as a ring.
//
// Rules this block enforces:
// - A title is required. It names the measure and the unit.
// - The fill is a stroked path with butt caps that ends exactly at the value. A round cap would
//   draw half a stroke past the value. It grows on ctx.noOvershoot("move"), so it never passes the
//   value on the way, also in systems whose curves overshoot.
// - The target is a drawn tick across the track, with its own label ("Target 10,000"). The current
//   value is printed above the bar (or inside the ring). The two labels sit on opposite sides of the
//   track, so they cannot collide however close the value is to the target.
// - The scale runs from zero to `max` (default: the larger of the target and the value). A value
//   above the target extends the scale, so the fill passes the tick and the tick stays in view.
// - A value too small to see gets a minimum visible fill; its value is printed in full anyway.
// - With `count`, the printed value rolls up as a counter on the same start, length and curve as the
//   fill, so the number and the fill always agree. Use it only for quantities that grow (rule 7).
// - The ring sizes itself so the ring, its target label and the title fit the box, and the value fits
//   inside the ring. The share of the target ("72 % of goal") goes under the value only when it fits.
//   Every text box passes textSafe.
import { appear, frameOf, go, px, textSafe } from "../context";
import type { Block, Ctx, Key, Node } from "../types";
import { counterLayout, counterNodes, steadyLines, type CounterFormat } from "./counter";
import { fmt, twoLines } from "./util";
import { GESTURES, hand, tagParts } from "./hand";

export type MeterProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  title: string;
  value: number;
  target: number;
  /** The end of the scale. Default: the larger of the target and the value. */
  max?: number;
  format?: CounterFormat;
  /** The word before the target value (default "Target"). */
  targetLabel?: string;
  shape?: "bar" | "ring";
  /** Fill in the accent (default true). Set false for every meter but one when a frame holds several,
   *  since systems such as Graphite allow one accent element per frame. Then the fill is ink. */
  accent?: boolean;
  count?: boolean;
  at: number;
  until?: number;
};

const textFmt = (v: number, f: CounterFormat = {}) => fmt(v, { prefix: f.prefix, suffix: f.suffix, decimals: f.decimals });

/** The title, one line or two, and the height it takes. */
function titleLines(p: MeterProps, ctx: Ctx, w: number) {
  const t = ctx.measure(p.title, "label") <= w ? [p.title] : (twoLines(p.title) ?? [p.title]);
  return { t, h: ctx.lineHeight("label") * t.length };
}

/** Keys for a fill that grows from 0 to 1 over the roll, on the counter's curve. */
function grow(ctx: Ctx, at: number, dur: number): Key[] {
  if (ctx.instant) return go(ctx, at, 0, 1);
  return [{ t: at, v: 0 }, { t: at + dur, v: 1, curve: ctx.noOvershoot("move") }];
}

export const meter: Block<MeterProps> = (p, ctx) => tagParts(drawMeter(p, ctx), p.id ?? "meter", GESTURES.meter!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawMeter: Block<MeterProps> = (p, ctx) => {
  const id = p.id ?? "meter";
  const out: Node[] = [];
  const fillRole = p.accent === false ? "ink" : "accent";
  const f = p.format ?? {};
  const max = Math.max(p.max ?? 0, p.target, p.value, 1e-9);
  const frac = Math.max(0, Math.min(1, p.value / max));
  const tFrac = Math.max(0, Math.min(1, p.target / max));
  const lhL = ctx.lineHeight("label"), sL = ctx.size("label");
  const gap = sL * 0.5;
  const exit = p.until;
  const fade = (at: number) => appear(ctx, at, exit, 0);
  // The fill and the count start on the entrance frame: a meter that sits on 0 reads as broken (as counter).
  const rollAt = p.at <= 0 ? p.at : frameOf(p.at) / 30;
  const rollDur = ctx.dur.move * 3;
  const count = !!p.count && p.value > 0;
  const targetText = `${p.targetLabel ?? "Target"} ${textFmt(p.target, f)}`;
  const tW = ctx.measure(targetText, "label");
  const safe = (b: { x: number; y: number; w: number; h: number }, what: string) => {
    if (!textSafe(ctx, b)) console.warn(`meter ${id}: ${what} is outside the text-safe area`);
  };

  if ((p.shape ?? "bar") === "bar") {
    // Rows, top to bottom: title, value, bar, target label.
    const title = titleLines(p, ctx, p.w);
    const barH = Math.max(ctx.stroke * 3, sL * 0.5);
    const tickExt = barH * 0.6;
    const below = tickExt + gap * 0.6 + lhL;
    const numBox = { x: p.x, y: p.y + title.h + gap, w: p.w, h: p.h - title.h - gap - gap - barH - tickExt - below };
    const num = counterLayout({ id, ...numBox, value: p.value, from: count ? 0 : p.value, format: f }, ctx, ["headline", "body"]);
    const total = title.h + gap + num.h + gap + tickExt + barH + below;
    if (total > p.h + 0.5) console.warn(`meter ${id}: the bar meter needs ${Math.ceil(total)} px but its box is ${Math.floor(p.h)} px high`);
    const y0 = p.y; // top-aligned, so meters set side by side share their title line
    out.push(...steadyLines(ctx, { id: `${id}-title`, x: p.x, y: y0, lines: title.t, role: "label", color: "inkMuted", at: p.at, until: exit }));
    title.t.forEach((l, i) => safe({ x: p.x, y: y0 + i * lhL, w: ctx.measure(l, "label"), h: lhL }, "the title"));
    const ny = y0 + title.h + gap;
    safe({ x: p.x, y: ny + num.padTop, w: num.w, h: num.lh }, "the value");
    out.push(...counterNodes({ id: `${id}-val`, x: p.x, y: ny, w: num.w, h: num.h, value: p.value, from: count ? 0 : p.value, format: f, role: num.role, at: p.at, until: exit },
      ctx, { rollAt, rollDur }, num));

    const by = ny + num.h + gap + tickExt + barH / 2; // the bar's centre line
    const x0 = p.x, x1 = p.x + p.w;
    const X = (fr: number) => x0 + fr * (x1 - x0);
    // The bar in the system's hand (hand.ts): round caps where its bars end round; a row of cells in Console.
    const HM = hand(ctx), cap = HM.end === "full" ? "round" as const : "butt" as const, cells: [number, number] | undefined = HM.bar === "cells" ? [barH, barH * 0.25] : undefined;
    out.push({ id: `${id}-track`, kind: "path", d: `M${px(x0)} ${px(by)}H${px(x1)}`, stroke: "rule", width: barH, cap, dash: cells,
      tracks: { draw: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(p.at) } });
    if (p.value > 0) {
      const xv = Math.max(X(frac), x0 + Math.max(barH * 0.5, ctx.stroke * 2)); // a minimum visible fill
      out.push({ id: `${id}-fill`, kind: "path", d: `M${px(x0)} ${px(by)}H${px(xv)}`, stroke: fillRole, width: barH, cap, dash: cells, z: 1,
        tracks: { draw: grow(ctx, rollAt, rollDur), ...fade(rollAt) } });
    }
    // The target: a tick across the bar and its label under it, kept inside the box.
    const xt = px(X(tFrac));
    const tickW = Math.max(ctx.stroke * 1.5, 2);
    const tAt = p.at + ctx.dur.stagger * 3;
    out.push({ id: `${id}-tick`, kind: "path", d: `M${xt} ${px(by - barH / 2 - tickExt)}V${px(by + barH / 2 + tickExt)}`, stroke: "ink", width: tickW, cap: "butt", z: 2,
      tracks: { draw: go(ctx, tAt, 0, 1, ctx.noOvershoot("enter"), 1, "enter"), ...fade(tAt) } });
    const lx = Math.min(Math.max(xt - tW / 2, x0), x1 - tW);
    const ly = by + barH / 2 + tickExt + gap * 0.6;
    safe({ x: lx, y: ly, w: tW, h: lhL }, "the target label");
    out.push(...steadyLines(ctx, { id: `${id}-target`, x: lx, y: ly, lines: [targetText], role: "label", color: "ink", at: tAt + ctx.dur.stagger, until: exit }));
    return out;
  }

  // Ring. The title sits on top, centred; the ring is centred under it. The ring starts at
  // 12 o'clock and fills clockwise.
  const title = titleLines(p, ctx, p.w);
  const area = { x: p.x, y: p.y + title.h + gap * 2, w: p.w, h: p.h - title.h - gap * 2 };
  const pctText = `${Math.round((p.value / p.target) * 100)} % of ${(p.targetLabel ?? "target").toLowerCase()}`;
  const pctW = ctx.measure(pctText, "label");
  type Fit = { r: number; tk: number; cx: number; cy: number; lb: { x: number; y: number; w: number; h: number }; num: ReturnType<typeof counterLayout>; top: number; bottom: number; withPct: boolean };
  const fitAt = (r: number): Fit | null => {
    const tk = Math.max(ctx.stroke * 4, r * 0.13);
    const R = r + tk / 2;
    const ext = tk * 0.35;
    const th = -Math.PI / 2 + tFrac * Math.PI * 2;
    const dx = Math.cos(th), dy = Math.sin(th);
    // The label sits beyond the tick's outer end, along the target's direction.
    const reach = R + ext + gap;
    const lb0 = { w: tW, h: lhL };
    let lcx = dx * (reach + Math.abs(dx) * lb0.w / 2), lcy = dy * (reach + Math.abs(dy) * lb0.h / 2);
    // Off the axes, a corner of the box can still reach the ring or the tick: push the box out along
    // the target's direction until its nearest point is at least `reach` from the centre.
    const nearest = () => Math.hypot(Math.max(Math.abs(lcx) - lb0.w / 2, 0), Math.max(Math.abs(lcy) - lb0.h / 2, 0));
    for (let k = 0; k < 400 && nearest() < reach - 0.01; k++) { lcx += dx * 2; lcy += dy * 2; }
    // Extents of ring plus label, relative to the ring centre.
    const left = Math.min(-R, lcx - lb0.w / 2), right = Math.max(R, lcx + lb0.w / 2);
    const top = Math.min(-R, lcy - lb0.h / 2), bottom = Math.max(R, lcy + lb0.h / 2);
    if (right - left > area.w || bottom - top > area.h) return null;
    const cx = area.x + area.w / 2 - (left + right) / 2;
    const cy = area.y - top;
    const lb = { x: cx + lcx - lb0.w / 2, y: cy + lcy - lb0.h / 2, ...lb0 };
    if (!textSafe(ctx, lb)) return null;
    // The value and the percentage fit in the square inside the ring.
    const side = (r - tk / 2 - ctx.stroke * 2) * Math.SQRT2;
    if (side <= 0) return null;
    // The share of the target goes under the value when it fits; else the value stands alone.
    const withPct = pctW <= side;
    const num = counterLayout({ id, x: cx - side / 2, y: cy - side / 2, w: side, h: side - (withPct ? lhL + gap : 0), value: p.value, from: count ? 0 : p.value, format: f }, ctx, ["headline", "body"], false);
    if (num.w > side + 0.5 || num.h > side + 0.5) return null;
    return { r, tk, cx, cy, lb, num, top: cy + top, bottom: cy + bottom, withPct: withPct && num.h + lhL + gap <= side };
  };
  let fit: Fit | null = null;
  for (let r = Math.min(area.w, area.h) / 2; r > sL * 2 && !fit; r -= 4) fit = fitAt(r);
  if (!fit) { console.warn(`meter ${id}: the ring does not fit its box`); return out; }
  const { r, tk, cx, lb, num } = fit;
  // The group is top-aligned, like the bar, so meters set side by side share their title line.
  const shift = 0;
  const cy = fit.cy + shift;
  const ty = p.y + shift;
  title.t.forEach((l, i) => {
    const w = ctx.measure(l, "label");
    safe({ x: cx - w / 2, y: ty + i * lhL, w, h: lhL }, "the title");
    out.push(...steadyLines(ctx, { id: `${id}-title-${i}`, x: cx - w / 2, y: ty + i * lhL, lines: [l], role: "label", color: "inkMuted", at: p.at + i * ctx.dur.stagger, until: exit }));
  });
  const pt = (fr: number, rad = r) => { const a = -Math.PI / 2 + fr * Math.PI * 2; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const; };
  const arc = (fr: number) => {
    const [sx, sy] = pt(0);
    if (fr >= 0.9999) { const [bx, byy] = pt(0.5); return `M${px(sx)} ${px(sy)}A${r} ${r} 0 1 1 ${px(bx)} ${px(byy)}A${r} ${r} 0 1 1 ${px(sx)} ${px(sy)}`; }
    const [ex, ey] = pt(fr);
    if (fr <= 0.5) return `M${px(sx)} ${px(sy)}A${r} ${r} 0 0 1 ${px(ex)} ${px(ey)}`;
    const [bx, byy] = pt(0.5);
    return `M${px(sx)} ${px(sy)}A${r} ${r} 0 0 1 ${px(bx)} ${px(byy)}A${r} ${r} 0 0 1 ${px(ex)} ${px(ey)}`;
  };
  const box = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
  const HR = hand(ctx), rcap = HR.end === "full" ? "round" as const : "butt" as const;
  out.push({ id: `${id}-track`, kind: "path", d: arc(1), stroke: "rule", width: tk, cap: "butt", box,
    tracks: { draw: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1.5, "move"), ...fade(p.at) } });
  if (p.value > 0) {
    const minFr = Math.max(tk * 0.5, ctx.stroke * 2) / (2 * Math.PI * r);
    out.push({ id: `${id}-fill`, kind: "path", d: arc(Math.max(frac, minFr)), stroke: fillRole, width: tk, cap: rcap, z: 1, box,
      tracks: { draw: grow(ctx, rollAt, rollDur), ...fade(rollAt) } });
  }
  const ext = tk * 0.35;
  const [ax, ay] = pt(tFrac, r - tk / 2 - ext), [bx, by2] = pt(tFrac, r + tk / 2 + ext);
  const tAt = p.at + ctx.dur.stagger * 3;
  out.push({ id: `${id}-tick`, kind: "path", d: `M${px(ax)} ${px(ay)}L${px(bx)} ${px(by2)}`, stroke: "ink", width: Math.max(ctx.stroke * 1.5, 2), cap: "butt", z: 2,
    tracks: { draw: go(ctx, tAt, 0, 1, ctx.noOvershoot("enter"), 1, "enter"), ...fade(tAt) } });
  safe({ ...lb, y: lb.y + shift }, "the target label");
  out.push(...steadyLines(ctx, { id: `${id}-target`, x: lb.x, y: lb.y + shift, lines: [targetText], role: "label", color: "ink", at: tAt + ctx.dur.stagger, until: exit }));
  // Inside: the value, and under it the share of the target.
  const inner = num.h + (fit.withPct ? gap + lhL : 0);
  const vy = cy - inner / 2;
  safe({ x: cx - num.w / 2, y: vy + num.padTop, w: num.w, h: num.lh }, "the value");
  out.push(...counterNodes({ id: `${id}-val`, x: cx - num.w / 2, y: vy, w: num.w, h: num.h, value: p.value, from: count ? 0 : p.value, format: f, role: num.role, at: p.at, until: exit },
    ctx, { rollAt, rollDur }, num));
  if (!fit.withPct) return out;
  safe({ x: cx - pctW / 2, y: vy + num.h + gap, w: pctW, h: lhL }, "the share");
  out.push(...steadyLines(ctx, { id: `${id}-pct`, x: cx - pctW / 2, y: vy + num.h + gap, lines: [pctText], role: "label", color: "inkMuted", at: count ? rollAt + rollDur : tAt + ctx.dur.stagger * 2, until: exit }));
  return out;
};
