// Slope chart: a before and an after value for several items, on two vertical axes, joined by lines.
// Use it when the change for each item, and how the items swap order, is the story.
//
// Rules this block enforces:
// - A title is required. It names the measure and the unit. A header over each axis names the two moments.
// - Both axes share one scale, so the slope of each line is the size of its change.
// - Every end carries a direct label with its value. When the width is short, the name prints on the
//   right side only, and the left side prints the value only.
// - Labels never collide. On each side they sort by height and stack apart by one line height; a stack
//   stays centred on its anchors and inside the plot. A label that moves away from its point gets a
//   leader line in the gutter between the axis and the labels, so a leader never crosses a slope.
// - The key item is heavy: a thick line in the key colour, larger dots, and its labels in ink. The other
//   lines are thin and quiet. So the key reads without colour.
// - Lines draw from left to right on a curve that never overshoots.
// - The block checks its own layout: no text overlaps text or a mark, and every text box passes textSafe.
import { appear, go, lines, px } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node } from "../types";
import { fmt, type Format } from "./util";
import { faultsOf, paintedBox, pick, type Layout, quietRole, rightLimit, titleLines, titlePad, type Mark, type TextBox } from "./barChart";
import { GESTURES, tagParts, textSafeBox } from "./hand";

export type SlopeChartProps = {
  id?: string;
  /** The block's box in px: title, headers, labels and lines all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Hours of daylight, by latitude". */
  title: string;
  /** The headers over the left and the right axis, for example "2015" and "2025". */
  fromLabel: string;
  toLabel: string;
  items: { label: string; from: number; to: number }[];
  /** The index of the key item. */
  key?: number;
  format?: Format;
  at: number;
  until?: number;
};

/**
 * Stacks labels on one axis without overlap. Each label wants its centre at `want`. Overlapping labels
 * merge into a cluster that centres on the mean of its wants, and every cluster stays inside [lo, hi].
 * Returns the top edge of each label, in the input order.
 */
function stack(wants: number[], h: number, lo: number, hi: number): number[] {
  const order = wants.map((w, i) => ({ w, i })).sort((a, b) => a.w - b.w);
  type C = { items: { w: number; i: number }[]; top: number };
  const place = (c: C) => {
    const H = c.items.length * h;
    const mean = c.items.reduce((s, it) => s + it.w, 0) / c.items.length;
    c.top = Math.max(lo, Math.min(hi - H, mean - H / 2));
  };
  let cs: C[] = order.map((it) => { const c = { items: [it], top: 0 }; place(c); return c; });
  for (let guard = 0; guard < 200; guard++) {
    let merged = false;
    for (let k = 0; k + 1 < cs.length; k++) {
      const a = cs[k]!, b = cs[k + 1]!;
      if (a.top + a.items.length * h > b.top + 0.01) {
        const c = { items: [...a.items, ...b.items], top: 0 };
        place(c);
        cs = [...cs.slice(0, k), c, ...cs.slice(k + 2)];
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }
  const out: number[] = new Array(wants.length);
  for (const c of cs) c.items.forEach((it, j) => (out[it.i] = c.top + j * h));
  return out;
}

type Mode = { leftNames: boolean };

function compose(p: SlopeChartProps, ctx: Ctx, mode: Mode): Layout {
  const id = p.id ?? "slope";
  const f = p.format ?? {};
  const out: Node[] = [];
  const texts: TextBox[] = [];
  const marks: Mark[] = [];
  const area = { x: p.x, y: p.y, w: p.w, h: p.h };
  const quiet = quietRole(ctx);
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  const n = p.items.length;
  const isKey = (i: number) => p.key === i;
  const t0 = p.at, exit = p.until;
  const fade = (at: number) => appear(ctx, at, exit, 0);
  const addText = (tid: string, x: number, y: number, text: string, color: ColorRole, at: number, group?: string) => {
    out.push({ id: tid, kind: "text", x, y, text, role: "label", color, tracks: fade(at) });
    texts.push({ id: tid, box: paintedBox(ctx, "label", x, y, ctx.measure(text, "label")), group });
  };

  // Title, then a row for the two headers.
  const tl = titleLines(ctx, p.title, Math.min(p.w, ctx.safe.right - p.x));
  const ty = p.y + titlePad(ctx);
  out.push(...lines(ctx, { id: `${id}-title`, x: p.x, y: ty, lines: tl, role: "label", color: "inkMuted", at: t0, until: exit }));
  tl.forEach((l, i) => texts.push({ id: `${id}-title-${i}`, box: { x: p.x, y: ty + i * lhL, w: ctx.measure(l, "label"), h: lhL }, group: "title" }));
  const headY = ty + lhL * (tl.length + 0.8);
  const plotTop = headY + lhL * 1.9; // the highest value sits here; its label may rise half a line above
  const plotBottom = p.y + p.h - lhL * 0.6;
  if (plotBottom - plotTop < lhL * 3) return { out, partial: true, faults: ["no room for the plot"] };

  const all = p.items.flatMap((it) => [it.from, it.to]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const Y = (v: number) => plotBottom - ((v - lo) / (hi - lo || 1)) * (plotBottom - plotTop);

  // Labels on each side are two columns: values next to the axis, right-aligned, and names outside them.
  const W = (t: string) => ctx.measure(t, "label");
  const vL = (i: number) => fmt(p.items[i]!.from, f), vR = (i: number) => fmt(p.items[i]!.to, f);
  const name = (i: number) => p.items[i]!.label;
  const nameGap = sL * 0.6;
  const vwL = Math.max(...p.items.map((_, i) => W(vL(i)))), vwR = Math.max(...p.items.map((_, i) => W(vR(i))));
  const nwL = mode.leftNames ? Math.max(...p.items.map((_, i) => W(name(i)))) + nameGap : 0;

  // Stack each side inside the plot, half a line of slack above and below.
  const bandLo = plotTop - lhL * 0.5, bandHi = plotBottom + lhL * 0.5;
  // Without names on the left, items with the same printed value there share one label (a tie prints once).
  const repL = p.items.map((_, i) => {
    if (mode.leftNames) return i;
    const same = p.items.map((_, j) => j).filter((j) => vL(j) === vL(i));
    return same.find(isKey) ?? same[0]!;
  });
  const reps = p.items.map((_, i) => i).filter((i) => repL[i] === i);
  // The pitch of a stack: a line height, and never less than the painted glyph box (up to 1.4 x the size).
  const pitch = Math.max(lhL, sL * 1.4);
  const lyRep = stack(reps.map((i) => Y(p.items[i]!.from)), pitch, bandLo, bandHi);
  const ly = p.items.map((_, i) => lyRep[reps.indexOf(repL[i]!)]!);
  const ry = stack(p.items.map((it) => Y(it.to)), pitch, bandLo, bandHi);
  const moved = (top: number, want: number) => Math.abs(top + lhL / 2 - want) > lhL * 0.3;
  const leadL = p.items.some((it, i) => repL[i] === i && moved(ly[i]!, Y(it.from)));
  const leadR = p.items.some((it, i) => moved(ry[i]!, Y(it.to)));
  const r = Math.max(ctx.stroke * 2.2, sL * 0.14);
  const gutL = r + sL * (leadL ? 1.3 : 0.45), gutR = r + sL * (leadR ? 1.3 : 0.45);

  // Axis positions: the left labels end at the left gutter; each right label must end inside its band.
  const leftW = nwL + vwL;
  const axL = p.x + leftW + gutL;
  // On a wide frame the slopes stop at a readable width (about 16 label sizes), and the chart keeps to the left.
  const axR = Math.min(axL + sL * 16, ...p.items.map((_, i) => rightLimit(ctx, p.x + p.w, ry[i]! + lhL) - vwR - nameGap - W(name(i)) - gutR));
  // Names on both sides only when the slopes keep a generous width; names on one side need less.
  const minW = mode.leftNames ? Math.min(sL * 16, Math.max(sL * 8, p.w * 0.4)) : Math.max(sL * 4, p.w * 0.22);
  if (axR - axL < minW) return { out, partial: true, faults: ["the slopes have too little width"] };

  // Axes and headers.
  out.push({ id: `${id}-axL`, kind: "path", d: `M${px(axL)} ${px(plotTop - lhL * 0.6)}V${px(plotBottom + lhL * 0.3)}`, stroke: "rule", width: ctx.stroke * 0.5,
    tracks: { draw: go(ctx, t0 + ctx.dur.stagger, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger) } });
  out.push({ id: `${id}-axR`, kind: "path", d: `M${px(axR)} ${px(plotTop - lhL * 0.6)}V${px(plotBottom + lhL * 0.3)}`, stroke: "rule", width: ctx.stroke * 0.5,
    tracks: { draw: go(ctx, t0 + ctx.dur.stagger * 2, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger * 2) } });
  marks.push({ id: `${id}-axL`, box: { x: axL - 1, y: plotTop - lhL * 0.6, w: 2, h: plotBottom - plotTop + lhL * 0.9 } });
  marks.push({ id: `${id}-axR`, box: { x: axR - 1, y: plotTop - lhL * 0.6, w: 2, h: plotBottom - plotTop + lhL * 0.9 } });
  const hR = rightLimit(ctx, p.x + p.w, headY + lhL);
  const head = (tid: string, text: string, cx: number, at: number) => {
    const w = ctx.measure(text, "label");
    addText(tid, Math.max(p.x, Math.min(cx - w / 2, hR - w)), headY, text, "ink", at);
  };
  head(`${id}-head-from`, p.fromLabel, axL, t0 + ctx.dur.stagger * 2);
  head(`${id}-head-to`, p.toLabel, axR, t0 + ctx.dur.stagger * 3);

  // Items: context first, the key last so its line draws on top and last.
  const order = p.items.map((_, i) => i).filter((i) => !isKey(i)).concat(p.items.map((_, i) => i).filter(isKey));
  const startL = t0 + ctx.dur.enter + ctx.dur.stagger * 3;
  const step = Math.min(ctx.dur.stagger * 2, 0.8 / Math.max(1, n));
  const drawAt = startL + n * step + ctx.dur.enter * 0.5;
  const drawT = ctx.instant ? 1 / 30 : ctx.dur.move * 1.4;
  const gapT = ctx.dur.stagger * 2;
  order.forEach((i, k) => {
    const it = p.items[i]!;
    const key = isKey(i);
    const color: ColorRole = key ? "series1" : quiet;
    const tc: ColorRole = key ? "ink" : "inkMuted";
    const yA = Y(it.from), yB = Y(it.to);
    const atL = startL + k * step;
    const atLine = drawAt + k * gapT;
    const atR = atLine + drawT;
    const rr = key ? r * 1.35 : r;

    // The slope.
    out.push({ id: `${id}-ln-${i}`, kind: "path", d: `M${px(axL)} ${px(yA)}L${px(axR)} ${px(yB)}`, stroke: color, width: ctx.stroke * (key ? 3 : 1.25), cap: "round", z: key ? 3 : 1,
      tracks: { draw: [{ t: atLine, v: 0 }, { t: atLine + drawT, v: 1, curve: ctx.instant ? "step" : ctx.noOvershoot("move") }], ...fade(atLine) } });
    out.push({ id: `${id}-da-${i}`, kind: "circle", cx: axL, cy: yA, r: rr, fill: color, z: key ? 4 : 2, origin: [0.5, 0.5], tracks: { ...fade(atL), scale: go(ctx, atL, 0.6, 1, ctx.noOvershoot("enter"), 1, "enter") } });
    out.push({ id: `${id}-db-${i}`, kind: "circle", cx: axR, cy: yB, r: rr, fill: color, z: key ? 4 : 2, origin: [0.5, 0.5], tracks: { ...fade(atR), scale: go(ctx, atR, 0.6, 1, ctx.noOvershoot("enter"), 1, "enter") } });
    marks.push({ id: `${id}-da-${i}`, box: { x: axL - rr, y: yA - rr, w: 2 * rr, h: 2 * rr } });
    marks.push({ id: `${id}-db-${i}`, box: { x: axR - rr, y: yB - rr, w: 2 * rr, h: 2 * rr } });

    // Left label, right-aligned against the gutter; right label, left-aligned after it.
    const lEnd = axL - gutL;
    if (repL[i] === i) addText(`${id}-val-l-${i}`, lEnd - W(vL(i)), ly[i]!, vL(i), tc, atL);
    if (mode.leftNames) addText(`${id}-name-l-${i}`, lEnd - vwL - nameGap - W(name(i)), ly[i]!, name(i), tc, atL);
    const rx = axR + gutR;
    addText(`${id}-val-r-${i}`, rx + vwR - W(vR(i)), ry[i]!, vR(i), tc, atR);
    addText(`${id}-name-r-${i}`, rx + vwR + nameGap, ry[i]!, name(i), tc, atR);

    // Leaders for labels that moved: from just outside the dot to just short of the text.
    const leader = (lid: string, x0: number, y0: number, x1: number, y1: number, at: number) => {
      out.push({ id: lid, kind: "path", d: `M${px(x0)} ${px(y0)}L${px(x1)} ${px(y1)}`, stroke: "inkMuted", width: ctx.stroke * 0.6, z: 2,
        tracks: { draw: go(ctx, at, 0, 1, "enter"), ...fade(at) } });
    };
    const stop = sL * 0.2;
    if (repL[i] === i && moved(ly[i]!, yA)) leader(`${id}-lead-l-${i}`, axL - rr - 2, yA, lEnd + stop, ly[i]! + lhL / 2, atL);
    if (moved(ry[i]!, yB)) leader(`${id}-lead-r-${i}`, axR + rr + 2, yB, rx + vwR - W(vR(i)) - stop, ry[i]! + lhL / 2, atR);
  });
  return { out, ...faultsOf(ctx, area, texts, marks) };
}

/** Prints names on both sides when they fit; else names on the right only. Keeps the first layout with no fault. */
export const slopeChart: Block<SlopeChartProps> = (p, ctx) => tagParts(drawSlopeChart(textSafeBox(ctx, p, `slopeChart ${p.id ?? "slope"}`, `use barChart (from: "top") with a series for each state`), ctx), p.id ?? "slope", GESTURES.slopeChart!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawSlopeChart: Block<SlopeChartProps> = (p, ctx) => pick(`slopeChart ${p.id ?? "slope"}`, (function* () { for (const mode of [{ leftNames: true }, { leftNames: false }]) yield compose(p, ctx, mode); })());

