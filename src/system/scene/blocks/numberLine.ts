// Number line: a scale with ticks, markers that slide to their values, and ranges as spans.
// Use it to compare magnitudes: 0.5 ms against 130 ms against 1,300 ms on a log scale.
//
// Rules this block enforces:
// - A title is required. It names the measure and the unit.
// - The scale is linear or logarithmic. A log scale shows its decades as major ticks and the values
//   2 to 9 of each decade as short minor ticks, so the uneven spacing tells the reader it is a log scale.
//   A log scale rejects values at or below zero.
// - Markers slide to their values on a curve that never overshoots, so a marker never passes its value.
//   A marker's label appears only after the marker lands, so no text moves across other text.
// - Labels place themselves. In a wide box, they stack in tiers above and below the axis and take the
//   nearest free spot. In a tall box, the axis is vertical and labels form rows to its right, pushed
//   apart where values are close. A label that has no room first wraps to two lines; only then is it
//   dropped, with a warning.
// - Values print as text. They never count up.
// - The key marker is larger, filled and labelled in ink. The others are hollow, with muted names.
//   Size, fill and weight mark the key marker, so colour never carries the meaning alone.
//
// This file also holds the axis engine that the timeline block uses: label sizes, tier placement,
// row placement and the overlap check.
import { appear, go, lines, px, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import { centreInk } from "../layout";
import type { Block, Ctx, Key, Node } from "../types";
import { fmt, niceScale, twoLines, type Box, type Format } from "./util";
import { GESTURES, tagParts } from "./hand";
import { tallBox } from "./lineChart";

// ---------------------------------------------------------------------------------------------
// The axis engine.

/** One line of a label. */
export type Line = { text: string; role: TypeRole; color: ColorRole };
/** Something to label at a position along an axis (px). Variants are line breaks, widest first. */
export type AxisItem = { anchor: number; variants: Line[][]; key?: boolean };
/** Where a label goes, and the stem from the axis to it. */
export type Spot = { lines: Line[]; box: Box; align: "left" | "center" | "right"; stem: [number, number, number, number] };

/** The right edge that text at this height may reach: the safe area, and the low band at 9:16. */
export const textRight = (ctx: Ctx, y: number, h: number) => (y + h > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right);

export function sizeOf(ctx: Ctx, ls: Line[]) {
  return { w: Math.max(...ls.map((l) => ctx.measure(l.text, l.role))), h: ls.reduce((s, l) => s + ctx.lineHeight(l.role), 0) };
}

/** A label as one line, and as two lines when its main text has a space. */
export function variantsOf(head: Line | null, body: Line): Line[][] {
  const one = head ? [head, body] : [body];
  const two = twoLines(body.text);
  if (!two) return [one];
  const split = two.map((t) => ({ ...body, text: t }));
  return [one, head ? [head, ...split] : split];
}

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inflate = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
/** Does the segment pass through the box? Sampled every 2 px. */
export function segHits(s: [number, number, number, number], b: Box): boolean {
  const [x0, y0, x1, y1] = s;
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/**
 * Tiers for a horizontal axis at y = `axis`. Labels go above (side "a") or below (side "b"), each on a
 * vertical stem from the axis. Stems start `edgeA` from the axis on both sides; labels below start
 * `edgeB` from it, so a row under the axis (tick labels) stays free. Each label takes the nearest free distance from the axis; at equal
 * distance it prefers one line on either side to two lines, and the side opposite to its left
 * neighbour, so neighbours alternate. A spot is free
 * when its padded box touches no obstacle, no other label and no stem, and its own stem crosses no label.
 */
export function placeTiers(ctx: Ctx, items: AxisItem[], g: { axis: number; edgeA: number; edgeB: number; top: number; bottom: number; x0: number; x1: number; obstacles: Box[]; sides?: ("a" | "b")[] }): (Spot | null)[] {
  const sL = ctx.size("label");
  const pad = sL * 0.35, stemMin = sL * 0.6, step = ctx.lineHeight("label") * 0.25;
  const taken: Box[] = [...g.obstacles];
  const stems: [number, number, number, number][] = [];
  const out: (Spot | null)[] = items.map(() => null);
  const byAnchor = items.map((_, i) => i).sort((a, b) => items[a]!.anchor - items[b]!.anchor);
  const rank = new Map(byAnchor.map((i, r) => [i, r]));
  const order = [...byAnchor.filter((i) => items[i]!.key), ...byAnchor.filter((i) => !items[i]!.key)];
  const sides = g.sides ?? ["a", "b"];
  for (const i of order) {
    const it = items[i]!;
    const pref: ("a" | "b")[] = sides.length === 2 ? ((rank.get(i)! % 2 === 0) ? ["a", "b"] : ["b", "a"]) : sides;
    let done = false;
    for (let d = 0; !done; d += step) {
      let inZone = false;
      // At each distance: one line on either side first, and only then two lines.
      for (const ls of it.variants) {
        for (const side of pref) {
          const { w, h } = sizeOf(ctx, ls);
          const y = side === "a" ? g.axis - g.edgeA - stemMin - d - h : g.axis + g.edgeB + stemMin + d;
          if (y < g.top - 0.5 || y + h > g.bottom + 0.5) continue;
          inZone = true;
          const xl = Math.max(g.x0, ctx.safe.left), xr = Math.min(g.x1, textRight(ctx, y, h));
          if (xr - xl < w) continue;
          const bx = Math.min(Math.max(it.anchor - w / 2, xl), xr - w);
          if (it.anchor < bx + 1 || it.anchor > bx + w - 1) continue; // the stem must meet the label
          const box = { x: bx, y, w, h };
          if (!textSafe(ctx, box)) continue;
          const padded = inflate(box, pad);
          if (taken.some((o) => hits(padded, o)) || stems.some((s) => segHits(s, padded))) continue;
          const stem: [number, number, number, number] = side === "a" ? [it.anchor, g.axis - g.edgeA, it.anchor, y + h] : [it.anchor, g.axis + g.edgeA, it.anchor, y];
          if (taken.some((o) => segHits(stem, inflate(o, pad * 0.5)))) continue;
          const align = Math.abs(bx - (it.anchor - w / 2)) < 0.5 ? "center" : bx <= xl + 0.5 ? "left" : "right";
          taken.push(box);
          stems.push(stem);
          out[i] = { lines: ls, box, align, stem };
          done = true;
          break;
        }
        if (done) break;
      }
      if (!inZone) break;
    }
  }
  return out;
}

/**
 * Rows beside a vertical axis at x = `axis`. Labels sit right of the axis (or left, for `side: "left"`),
 * in anchor order. Each label's first line is centred on its anchor when there is room; close labels
 * push each other apart, and the rows stay between `top` and `bottom`. A label that is too wide for its
 * row takes its two-line variant. When the rows cannot fit, the last non-key label is dropped, with a warning.
 */
export function placeRows(ctx: Ctx, items: AxisItem[], g: { axis: number; edge: number; textX: number; limit: number; top: number; bottom: number; side?: "right" | "left"; name: string }): (Spot | null)[] {
  const sL = ctx.size("label");
  const gap = sL * 0.45, stop = sL * 0.3;
  const left = g.side === "left";
  const out: (Spot | null)[] = items.map(() => null);
  let live = items.map((_, i) => i).sort((a, b) => items[a]!.anchor - items[b]!.anchor);
  const room = (y: number, h: number) => (left ? g.textX - Math.max(g.limit, ctx.safe.left) : Math.min(g.limit, textRight(ctx, y, h)) - g.textX);
  const choice = new Map<number, number>();
  for (let tries = 0; tries < items.length + 4; tries++) {
    // Each row starts with its widest variant that fits at its wanted height.
    for (const i of live) if (!choice.has(i)) {
      const it = items[i]!;
      const lh0 = ctx.lineHeight(it.variants[0]![0]!.role);
      const k = it.variants.findIndex((ls) => { const s = sizeOf(ctx, ls); return s.w <= room(it.anchor - lh0 / 2, s.h); });
      choice.set(i, k < 0 ? it.variants.length - 1 : k);
    }
    const size = live.map((i) => sizeOf(ctx, items[i]!.variants[choice.get(i)!]!));
    const head = live.map((i) => ctx.lineHeight(items[i]!.variants[choice.get(i)!]![0]!.role));
    const tops = live.map((i, k) => items[i]!.anchor - head[k]! / 2);
    for (let k = 0; k < tops.length; k++) tops[k] = Math.max(tops[k]!, k ? tops[k - 1]! + size[k - 1]!.h + gap : g.top);
    for (let k = tops.length - 1; k >= 0; k--) tops[k] = Math.min(tops[k]!, (k < tops.length - 1 ? tops[k + 1]! - gap : g.bottom) - size[k]!.h);
    if (tops.length && tops[0]! < g.top - 0.5) {
      const drop = [...live].reverse().find((i) => !items[i]!.key) ?? live[live.length - 1]!;
      console.warn(`${g.name}: no room for every label; one label is left out`);
      live = live.filter((i) => i !== drop);
      continue;
    }
    // A row that ends up lower may meet the narrower low band: give it its two-line variant and settle again.
    let changed = false;
    live.forEach((i, k) => {
      const it = items[i]!;
      const c = choice.get(i)!;
      if (size[k]!.w > room(tops[k]!, size[k]!.h) + 0.5 && c < it.variants.length - 1) { choice.set(i, c + 1); changed = true; }
    });
    if (changed) continue;
    live.forEach((i, k) => {
      const it = items[i]!;
      const ls = it.variants[choice.get(i)!]!;
      const s = size[k]!;
      if (s.w > room(tops[k]!, s.h) + 0.5) { console.warn(`${g.name}: a label is too wide for its row and is left out`); return; }
      const x = left ? g.textX - s.w : g.textX;
      const box = { x, y: tops[k]!, w: s.w, h: s.h };
      const ey = tops[k]! + head[k]! / 2;
      const ax = left ? g.axis - g.edge : g.axis + g.edge;
      out[i] = { lines: ls, box, align: left ? "right" : "left", stem: [ax, it.anchor, left ? x + s.w + stop : x - stop, ey] };
    });
    return out;
  }
  return out;
}

/** Warns when any two text boxes overlap, or a stem crosses a text box other than its own. */
export function checkOverlap(name: string, boxes: Box[], stems: ([number, number, number, number] | null)[]) {
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) if (hits(boxes[a]!, boxes[b]!)) console.warn(`${name}: two labels overlap`);
    stems.forEach((s, k) => { if (s && k !== a && segHits(s, inflate(boxes[a]!, -1))) console.warn(`${name}: a stem crosses a label`); });
  }
}

/** The stem and the lines of a placed label. The stem draws first; the lines follow, one by one. */
export function drawSpot(ctx: Ctx, id: string, s: Spot, at: number, exit: number | undefined, o: { stem: boolean; stemColor: ColorRole; stemWidth: number; trim: number }): Node[] {
  const out: Node[] = [];
  const [x0, y0, x1, y1] = s.stem;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (o.stem && len > o.trim + 2) {
    // The stem starts at the axis edge and stops short of the text.
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const ex = x1 - ux * o.trim, ey = y1 - uy * o.trim;
    out.push({ id: `${id}-stem`, kind: "path", d: `M${px(x0)} ${px(y0)}L${px(ex)} ${px(ey)}`, stroke: o.stemColor, width: o.stemWidth, z: 1,
      tracks: { draw: go(ctx, at, 0, 1, "enter"), ...appear(ctx, at, exit, 0) } });
  }
  let y = s.box.y;
  s.lines.forEach((l, k) => {
    out.push({ id: `${id}-t${k}`, kind: "text", x: s.box.x, y, width: s.box.w, align: s.align, text: l.text, role: l.role, color: l.color,
      tracks: appear(ctx, at + ctx.dur.stagger * (k + 1), exit, 6) });
    y += ctx.lineHeight(l.role);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The number line block.

export type NumberLineProps = {
  id?: string;
  /** The block's box in px: title, axis and labels all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Light travel time, milliseconds (log scale)". */
  title: string;
  min: number; max: number;
  scale?: "linear" | "log";
  /** Major ticks. Default: each power of ten (log), or about five round steps (linear). */
  ticks?: number[];
  /** Format of the tick labels. Default: plain numbers with as many decimals as the tick needs. */
  tickFormat?: Format;
  /** Format of marker values, when a marker has no `valueLabel`. */
  format?: Format;
  /** Default "auto": horizontal in a wide box, vertical in a tall one. */
  orientation?: "auto" | "horizontal" | "vertical";
  /** Points on the scale. Each slides from `from` (default: the scale's minimum) to `value`. */
  markers: { value: number; label: string; valueLabel?: string; key?: boolean; at: number; from?: number }[];
  /** Spans on the scale, drawn as a thick band over the axis. */
  ranges?: { from: number; to: number; label: string; valueLabel?: string; at: number }[];
  at: number;
  until?: number;
};

export const numberLine: Block<NumberLineProps> = (p, ctx) => tagParts(drawNumberLine(p, ctx), p.id ?? "nline", GESTURES.numberLine!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawNumberLine: Block<NumberLineProps> = (p, ctx) => {
  const id = p.id ?? "nline";
  const name = `numberLine ${id}`;
  const log = p.scale === "log";
  if (p.max <= p.min) throw new Error(`${name}: max must be above min`);
  if (log && (p.min <= 0 || p.markers.some((m) => m.value <= 0 || (m.from ?? p.min) <= 0) || (p.ranges ?? []).some((r) => r.from <= 0)))
    throw new Error(`${name}: a log scale needs values above zero`);
  const T = (v: number) => (log ? Math.log10(v) : v);
  const lo = T(p.min), hi = T(p.max);
  const clampV = (v: number) => Math.min(p.max, Math.max(p.min, v));
  const exit = p.until;
  const out: Node[] = [];
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  const vertical = p.orientation === "vertical" || ((p.orientation ?? "auto") === "auto" && p.h > p.w * 1.1);

  // Ticks: decades on a log scale, round steps on a linear one.
  const ticks = (p.ticks ?? (log
    ? Array.from({ length: Math.floor(hi + 1e-9) - Math.ceil(lo - 1e-9) + 1 }, (_, i) => 10 ** (Math.ceil(lo - 1e-9) + i))
    : niceScale(p.min, p.max, 5).ticks)).filter((v) => v >= p.min - 1e-9 && v <= p.max + 1e-9);
  const tickText = (v: number) => fmt(v, { ...p.tickFormat, decimals: p.tickFormat?.decimals ?? (Math.abs(v) < 1 && v !== 0 ? Math.ceil(-Math.log10(Math.abs(v)) - 1e-9) : 0) });
  const minor: number[] = [];
  if (log) for (let d = Math.floor(lo); d < Math.ceil(hi); d++) for (let m = 2; m <= 9; m++) { const v = m * 10 ** d; if (v > p.min && v < p.max) minor.push(v); }

  // Title.
  const titleLines = ctx.measure(p.title, "label") <= p.w ? [p.title] : (twoLines(p.title) ?? [p.title]);
  const titleH = lhL * (titleLines.length + 0.9);
  out.push(...lines(ctx, { id: `${id}-title`, x: p.x, y: p.y, lines: titleLines, role: "label", color: "inkMuted", at: p.at, until: exit }));
  const top = p.y + titleH, bottom = p.y + p.h;

  const rKey = ctx.stroke * 4.5, rDot = ctx.stroke * 3.2;
  const band = ctx.stroke * 5;
  const tickLen = sL * 0.4;
  const tickW = ticks.map((v) => ctx.measure(tickText(v), "label"));

  // Geometry: P maps a value to px along the axis.
  let P: (v: number) => number;
  let axisLine: string;
  const tickNodes: { d: string; minor: boolean }[] = [];
  const tickBoxes: Box[] = [];
  let place: (items: AxisItem[]) => (Spot | null)[];
  let at0: (pos: number) => [number, number];
  // A tall box (9:16, reaching the lower band): the axis lies low, in the lower band where marks may go, and every
  // label stands above it on a stem, in the text-safe area. The tick values would fall in the lower band, so they are
  // left out: the markers carry their values, and the minor ticks keep the scale's rhythm.
  const low = !vertical && tallBox(ctx, p);
  if (!vertical) {
    const x0 = p.x + Math.max(tickW[0]! / 2, rKey), x1 = p.x + p.w - Math.max(tickW[tickW.length - 1]! / 2, rKey);
    const edgeA = Math.max(rKey, band / 2) + 2, edgeB = tickLen + sL * 0.25 + lhL;
    const ay = low ? px(bottom - edgeA - tickLen) : px((top + bottom + edgeA - edgeB) / 2);
    P = (v) => x0 + ((T(clampV(v)) - lo) / (hi - lo)) * (x1 - x0);
    axisLine = `M${px(x0)} ${ay}H${px(x1)}`;
    ticks.forEach((v, i) => {
      const x = px(P(v));
      tickNodes.push({ d: `M${x} ${ay}V${px(ay + tickLen)}`, minor: false });
      if (!low) tickBoxes.push({ x: x - tickW[i]! / 2, y: ay + tickLen + sL * 0.25, w: tickW[i]!, h: lhL });
    });
    for (const v of minor) { const x = px(P(v)); tickNodes.push({ d: `M${x} ${ay}V${px(ay + tickLen * 0.55)}`, minor: true }); }
    at0 = (pos) => [pos, ay];
    place = (items) => placeTiers(ctx, items, { axis: ay, edgeA, edgeB, top, bottom, x0: p.x, x1: p.x + p.w, obstacles: tickBoxes.map((b) => inflate(b, 2)), sides: low ? ["a"] : undefined });
  } else {
    const tickColW = Math.max(...tickW);
    const ax = px(p.x + tickColW + sL * 0.3 + tickLen);
    const ya = top + lhL / 2, yb = bottom - lhL / 2;
    P = (v) => yb - ((T(clampV(v)) - lo) / (hi - lo)) * (yb - ya);
    axisLine = `M${ax} ${px(yb)}V${px(ya)}`;
    ticks.forEach((v, i) => {
      const y = px(P(v));
      tickNodes.push({ d: `M${ax} ${y}H${px(ax - tickLen)}`, minor: false });
      tickBoxes.push({ x: ax - tickLen - sL * 0.3 - tickW[i]!, y: centreInk(ctx, tickText(v), "label", { y, h: 0 }), w: tickW[i]!, h: lhL });
    });
    for (const v of minor) { const y = px(P(v)); tickNodes.push({ d: `M${ax} ${y}H${px(ax - tickLen * 0.55)}`, minor: true }); }
    at0 = (pos) => [ax, pos];
    const edge = Math.max(rKey, band / 2) + 2;
    place = (items) => placeRows(ctx, items, { axis: ax, edge, textX: ax + edge + sL * 1.4, limit: p.x + p.w, top, bottom, name });
  }

  // Axis, ticks and tick labels.
  const t0 = p.at + ctx.dur.stagger * 2;
  out.push({ id: `${id}-axis`, kind: "path", d: axisLine, stroke: "ink", width: ctx.stroke, tracks: { draw: go(ctx, t0, 0, 1, "move"), ...appear(ctx, t0, exit, 0) } });
  tickNodes.forEach((t, i) => {
    const at = t0 + ctx.dur.move * 0.5 + (t.minor ? ctx.dur.stagger * 2 : 0);
    out.push({ id: `${id}-tick-${i}`, kind: "path", d: t.d, stroke: t.minor ? "rule" : "ink", width: t.minor ? Math.max(1, ctx.stroke * 0.5) : ctx.stroke, tracks: appear(ctx, at, exit, 0) });
  });
  if (!low) ticks.forEach((v, i) => {
    const b = tickBoxes[i]!;
    out.push({ id: `${id}-tl-${i}`, kind: "text", x: b.x, y: b.y, text: tickText(v), role: "label", color: "inkMuted",
      tracks: appear(ctx, t0 + ctx.dur.move * 0.5 + ctx.dur.stagger * i, exit, 0) });
  });

  // Labels: values first (the line that meets the stem), then names. Units can be lower case, so both
  // use the caption role: some systems set the label role in capitals.
  const markers = p.markers, ranges = p.ranges ?? [];
  const valueText = (v: number) => fmt(v, p.format);
  const items: AxisItem[] = [
    ...markers.map((m) => ({ anchor: P(m.value), key: m.key, variants: variantsOf({ text: m.valueLabel ?? valueText(m.value), role: "caption", color: "ink" }, { text: m.label, role: "caption", color: m.key ? "ink" : "inkMuted" }) })),
    ...ranges.map((r) => ({ anchor: (P(r.from) + P(r.to)) / 2, variants: variantsOf({ text: r.valueLabel ?? `${fmt(r.from, p.format)}–${fmt(r.to, p.format)}`, role: "caption", color: "ink" }, { text: r.label, role: "caption", color: "inkMuted" }) })),
  ];
  const spots = place(items);
  checkOverlap(name, [...tickBoxes, ...spots.filter((s): s is Spot => !!s).map((s) => s.box)], [...tickBoxes.map(() => null), ...spots.filter((s): s is Spot => !!s).map((s) => s.stem)]);

  const slide = ctx.instant ? 1 / 30 : ctx.dur.move * 1.6;
  // A marker or range whose label found no room is left out whole: nothing shows without its label.
  ranges.forEach((r, i) => {
    const s = spots[markers.length + i];
    // A range or marker that would land after the block leaves is not drawn.
    if (!s || (exit !== undefined && r.at + slide + ctx.dur.stagger * 4 >= exit)) return;
    const [a0, a1] = [P(r.from), P(r.to)];
    const [xa, ya] = at0(a0), [xb, yb] = at0(a1);
    const draw: Key[] = ctx.instant ? go(ctx, r.at, 0, 1) : [{ t: r.at, v: 0 }, { t: r.at + slide, v: 1, curve: ctx.noOvershoot("move") }];
    out.push({ id: `${id}-range-${i}`, kind: "path", d: `M${px(xa)} ${px(ya)}L${px(xb)} ${px(yb)}`, stroke: "series2", width: band, cap: "butt", z: 2,
      tracks: { draw, ...appear(ctx, r.at, exit, 0) } });
    out.push(...drawSpot(ctx, `${id}-rl-${i}`, s, r.at + slide, exit, { stem: true, stemColor: "inkMuted", stemWidth: ctx.stroke * 0.75, trim: sL * 0.25 }));
  });
  markers.forEach((m, i) => {
    const s = spots[i];
    if (!s || (exit !== undefined && m.at + slide + ctx.dur.stagger * 4 >= exit)) return;
    const pos = P(m.value), from = P(m.from ?? p.min);
    const [cx, cy] = at0(pos);
    const r = m.key ? rKey : rDot;
    const move: Key[] = ctx.instant ? go(ctx, m.at, from - pos, 0) : [{ t: m.at, v: from - pos }, { t: m.at + slide, v: 0, curve: ctx.noOvershoot("move") }];
    out.push({ id: `${id}-dot-${i}`, kind: "circle", cx, cy, r, fill: m.key ? "series1" : "ground", stroke: m.key ? undefined : "ink", width: m.key ? undefined : ctx.stroke, z: m.key ? 4 : 3,
      tracks: { [vertical ? "y" : "x"]: move, opacity: [...go(ctx, m.at, 0, 1, "enter"), ...(exit !== undefined ? go(ctx, exit, 1, 0, "exit") : [])] } });
    out.push(...drawSpot(ctx, `${id}-ml-${i}`, s, m.at + slide, exit, { stem: true, stemColor: m.key ? "ink" : "inkMuted", stemWidth: ctx.stroke * (m.key ? 1 : 0.75), trim: sL * 0.25 }));
  });
  return out;
};
