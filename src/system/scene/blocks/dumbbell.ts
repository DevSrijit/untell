// Dumbbell: two values per row, a start and an end, shown as two dots joined by a line on one shared axis.
// Use it for a before/after change per row, or for a range (low to high) per row.
//
// Rules this block enforces:
// - A title is required. It names the measure and the unit.
// - Position, not length, carries each value, so the axis need not start at zero. The shared axis at
//   the foot of the rows shows round ticks.
// - The direction of change reads without colour: the start is a hollow ring and the end is a filled dot,
//   the line draws from the start to the end, and a key under the title names both ends.
// - Rows are sorted (by the end value, high to low, unless the caller asks otherwise).
// - Every dot prints its value on its outer side, away from the other dot, so the two labels never meet.
//   When the two values are equal, the row shows one dot and one label.
// - The key row is marked by more than colour: a heavier line, larger dots, and its label and values in ink.
// - The scale makes room for the widest value labels at both ends of every row; at 9:16 it keeps the
//   right labels inside the narrow low band. Long row labels wrap to two lines or move above the row.
// - The block checks its own layout: no text overlaps text or a mark, and every text box passes textSafe.
import { appear, go, lines, px } from "../context";
import type { ColorRole } from "../roles";
import { centreInk, centreInkLines } from "../layout";
import type { Block, Ctx, Node } from "../types";
import { fmt, niceScale, twoLines, type Format } from "./util";
import { faultsOf, paintedBox, pick, type Layout, fitScale, quietRole, rightLimit, tickFormat, titleLines, titlePad, type Mark, type TextBox } from "./barChart";
import { GESTURES, hand, tagParts, textSafeBox } from "./hand";

export type DumbbellProps = {
  id?: string;
  /** The block's box in px: title, key, rows and axis all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Liquid range at sea-level pressure, °C". */
  title: string;
  rows: { label: string; from: number; to: number }[];
  /** What the start and the end mean, for the key: "Melts" and "Boils", or "2015" and "2025". */
  fromLabel: string;
  toLabel: string;
  /** Row order. "to" (default) and "from" sort by that value, high to low; "change" by to - from; "none" keeps the given order. */
  sort?: "to" | "from" | "change" | "none";
  /** The index of the key row in `rows` as given (before sorting). */
  key?: number;
  format?: Format;
  at: number;
  until?: number;
};

// The last two modes let the label column take more width, as a last resort before a fault.
type Mode = { cat: 1 | 2; above: boolean; col: number };
const MODES: Mode[] = [{ cat: 1, above: false, col: 0.45 }, { cat: 2, above: false, col: 0.45 }, { cat: 1, above: true, col: 0 }, { cat: 2, above: true, col: 0 },
  { cat: 2, above: false, col: 0.6 }, { cat: 1, above: false, col: 0.6 }];

function compose(p: DumbbellProps, ctx: Ctx, mode: Mode): Layout {
  const id = p.id ?? "dumbbell";
  const f = p.format ?? {};
  const out: Node[] = [];
  const texts: TextBox[] = [];
  const marks: Mark[] = [];
  const area = { x: p.x, y: p.y, w: p.w, h: p.h };
  const quiet = quietRole(ctx);
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  const gap = Math.round(sL * 0.3);
  const t0 = p.at, exit = p.until;
  const fade = (at: number) => appear(ctx, at, exit, 0);
  const addText = (tid: string, x: number, y: number, text: string, color: ColorRole, at: number, group?: string) => {
    out.push({ id: tid, kind: "text", x, y, text, role: "label", color, tracks: fade(at) });
    texts.push({ id: tid, box: paintedBox(ctx, "label", x, y, ctx.measure(text, "label")), group });
  };

  // Rows in display order. Each keeps its index in the caller's list, for the key.
  const sort = p.sort ?? "to";
  const rows = p.rows.map((r, i) => ({ ...r, i }));
  if (sort !== "none") rows.sort((a, b) => (sort === "to" ? b.to - a.to : sort === "from" ? b.from - a.from : (b.to - b.from) - (a.to - a.from)));
  const n = rows.length;
  const isKey = (i: number) => p.key === i;

  // Title.
  const tl = titleLines(ctx, p.title, Math.min(p.w, ctx.safe.right - p.x));
  const ty = p.y + titlePad(ctx);
  out.push(...lines(ctx, { id: `${id}-title`, x: p.x, y: ty, lines: tl, role: "label", color: "inkMuted", at: t0, until: exit }));
  tl.forEach((l, i) => texts.push({ id: `${id}-title-${i}`, box: { x: p.x, y: ty + i * lhL, w: ctx.measure(l, "label"), h: lhL }, group: "title" }));
  let top = ty + lhL * (tl.length + 0.7);

  // Dot sizes: large enough for a ring to read as hollow, also with Pop's thick stroke.
  const r = Math.max(sL * 0.24, ctx.stroke * 2.4);
  const rKey = r * 1.2;
  const ring = Math.max(1.5, ctx.stroke * 1.25);

  // The key: a ring for the start, a dot for the end.
  {
    const cy = top + lhL / 2;
    let kx = p.x + r;
    out.push({ id: `${id}-k-from`, kind: "circle", cx: kx, cy, r: r - ring / 2, fill: "ground", stroke: "ink", width: ring, tracks: fade(t0 + ctx.dur.stagger) });
    marks.push({ id: `${id}-k-from`, box: { x: kx - r, y: cy - r, w: 2 * r, h: 2 * r } });
    addText(`${id}-k-from-t`, kx + r + gap, top, p.fromLabel, "inkMuted", t0 + ctx.dur.stagger);
    kx += r + gap + ctx.measure(p.fromLabel, "label") + sL * 1.1 + r;
    out.push({ id: `${id}-k-to`, kind: "circle", cx: kx, cy, r, fill: "ink", tracks: fade(t0 + ctx.dur.stagger * 2) });
    marks.push({ id: `${id}-k-to`, box: { x: kx - r, y: cy - r, w: 2 * r, h: 2 * r } });
    addText(`${id}-k-to-t`, kx + r + gap, top, p.toLabel, "inkMuted", t0 + ctx.dur.stagger * 2);
    top += lhL * 1.4;
  }

  // Rows: a label column on the left, or each label on its own line above its row.
  const axisH = lhL + sL * 0.75;
  const bottom = p.y + p.h - axisH;
  // In two-line mode only a label wider than the column limit wraps.
  const colMax = mode.above ? p.w : p.w * mode.col;
  const catLines = (t: string) => (mode.cat === 2 && ctx.measure(t, "label") > colMax ? (twoLines(t) ?? [t]) : [t]);
  const catW = (t: string) => Math.max(...catLines(t).map((l) => ctx.measure(l, "label")));
  const catLH = mode.above ? lhL * mode.cat + sL * 0.1 : 0;
  const rowMin = Math.max(lhL, 2 * rKey + sL * 0.2);
  let rowH = (bottom - top) / n;
  rowH = Math.min(rowH, catLH + lhL * (mode.above ? 1.5 : Math.max(mode.cat, 1) + 0.9));
  if (rowH < catLH + rowMin) return { out, partial: true, faults: ["rows too short"] };
  const colW = mode.above ? 0 : Math.max(...rows.map((rw) => catW(rw.label)));
  if (colW > colMax) return { out, partial: true, faults: ["label column too wide"] };
  const plotL = p.x + (mode.above ? 0 : colW + sL * 0.8);
  const rowY = (k: number) => top + k * rowH + catLH + (rowH - catLH) / 2; // the dumbbell's centre line
  const lastY = top + n * rowH;

  // Fit the scale: each row needs its outer labels beside its dots.
  const vtext = (v: number) => fmt(v, f);
  const items = rows.map((rw, k) => {
    const lo = Math.min(rw.from, rw.to), hi = Math.max(rw.from, rw.to);
    const rr = isKey(rw.i) ? rKey : r;
    const same = rw.from === rw.to;
    return {
      lo, hi,
      padLo: rr + (same ? 0 : gap + ctx.measure(vtext(lo), "label")),
      padHi: rr + gap + ctx.measure(vtext(hi), "label"),
      right: rightLimit(ctx, p.x + p.w, rowY(k) + lhL / 2),
    };
  });
  const fit = fitScale(items, plotL);
  if (fit.k <= 0) return { out, partial: true, faults: ["no room for the rows"] };
  const X = (v: number) => fit.x0 + v * fit.k;

  // The shared axis: a hairline, tick marks and round tick values under the last row.
  const dmin = Math.min(...rows.map((rw) => Math.min(rw.from, rw.to))), dmax = Math.max(...rows.map((rw) => Math.max(rw.from, rw.to)));
  // The tick step: the finest round step whose tick values all fit side by side, with a gap.
  const axY = lastY + sL * 0.2;
  const axR = rightLimit(ctx, p.x + p.w, axY + sL * 0.5 + lhL);
  const fits = (ts: number[], tf: Format) => ts.every((t, i) => {
    const lw = ctx.measure(fmt(t, tf), "label"), lx = X(t) - lw / 2;
    if (lx < p.x || lx + lw > axR) return false;
    if (i === 0) return true;
    const pw = ctx.measure(fmt(ts[i - 1]!, tf), "label");
    return lx >= X(ts[i - 1]!) + pw / 2 + sL * 0.8;
  });
  let ticks: number[] = [], tf: Format = f;
  for (const count of [6, 5, 4, 3, 2]) {
    const sc = niceScale(dmin, dmax, count);
    const ts = sc.ticks.filter((t) => t >= dmin - 1e-9 && t <= dmax + 1e-9);
    const tfc = tickFormat(f, sc.ticks);
    if (ts.length >= 2 && fits(ts, tfc)) { ticks = ts; tf = tfc; break; }
  }
  out.push({ id: `${id}-axis`, kind: "path", d: `M${px(X(dmin))} ${px(axY)}H${px(X(dmax))}`, stroke: "rule", width: ctx.stroke * 0.5,
    tracks: { draw: go(ctx, t0 + ctx.dur.stagger, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger) } });
  marks.push({ id: `${id}-axis`, box: { x: X(dmin), y: axY - 1, w: X(dmax) - X(dmin), h: 2 } });
  let lastEnd = -Infinity;
  ticks.forEach((t, i) => {
    const label = fmt(t, tf), lw = ctx.measure(label, "label"), tx = X(t);
    const lx = tx - lw / 2;
    if (lx < lastEnd) return;
    lastEnd = lx + lw;
    out.push({ id: `${id}-tk-${i}`, kind: "path", d: `M${px(tx)} ${px(axY)}V${px(axY + sL * 0.25)}`, stroke: "rule", width: ctx.stroke * 0.5, tracks: fade(t0 + ctx.dur.stagger * 2) });
    addText(`${id}-tick-${i}`, lx, axY + sL * 0.4, label, "inkMuted", t0 + ctx.dur.stagger * (2 + i * 0.5));
  });

  // Rows, top to bottom.
  const start = t0 + ctx.dur.enter + ctx.dur.stagger * 2;
  const step = Math.min(ctx.dur.stagger * 3, 1.4 / Math.max(1, n));
  const drawT = ctx.instant ? 1 / 30 : ctx.dur.move;
  rows.forEach((rw, k) => {
    const key = isKey(rw.i);
    const rr = key ? rKey : r;
    const color: ColorRole = key ? "series1" : quiet;
    const cy = rowY(k);
    const at = start + k * step;
    const done = at + ctx.dur.enter * 0.5 + drawT;
    const xa = X(rw.from), xb = X(rw.to);
    const same = rw.from === rw.to;

    // Row label.
    const cl = catLines(rw.label);
    const ly = mode.above ? top + k * rowH : centreInkLines(ctx, cl, "label", { y: cy, h: 0 }, lhL);
    cl.forEach((l, j) => {
      addText(`${id}-cat-${k}-${j}`, mode.above ? plotL : p.x, ly + j * lhL, l, key ? "ink" : "inkMuted", t0 + ctx.dur.stagger * (2 + k * 0.5), `cat-${k}`);
    });

    // The line from the start ring to the end dot. It draws in the direction of change.
    const dir = Math.sign(xb - xa);
    if (!same && Math.abs(xb - xa) > rr * 2 + 2) {
      const lw = ctx.stroke * (key ? 2.2 : 1.2);
      out.push({ id: `${id}-ln-${k}`, kind: "path", d: `M${px(xa + dir * rr)} ${px(cy)}H${px(xb - dir * rr)}`, stroke: color, width: lw, cap: "butt", z: 1,
        tracks: { draw: [{ t: at + ctx.dur.enter * 0.5, v: 0 }, { t: at + ctx.dur.enter * 0.5 + drawT, v: 1, curve: ctx.instant ? "step" : ctx.noOvershoot("move") }], ...fade(at) } });
      marks.push({ id: `${id}-ln-${k}`, box: { x: Math.min(xa, xb), y: cy - lw / 2, w: Math.abs(xb - xa), h: lw } });
    }
    // Start: a hollow ring. End: a filled dot. Equal values: the end dot only.
    if (!same) {
      out.push({ id: `${id}-from-${k}`, kind: "circle", cx: xa, cy, r: rr - ring / 2, fill: "ground", stroke: color, width: ring, z: 2, origin: [0.5, 0.5],
        tracks: { ...fade(at), scale: go(ctx, at, 0.6, 1, ctx.noOvershoot("enter"), 1, "enter") } });
      marks.push({ id: `${id}-from-${k}`, box: { x: xa - rr, y: cy - rr, w: rr * 2, h: rr * 2 } });
    }
    // The end mark in the system's hand (hand.ts): a dot, or a square where the hand draws cells and blocks.
    const toTracks = { ...fade(same ? at : done), scale: go(ctx, same ? at : done, 0.6, 1, ctx.noOvershoot("enter"), 1, "enter") };
    out.push(hand(ctx).dot === "square"
      ? { id: `${id}-to-${k}`, kind: "path", d: `M${px(xb - rr)} ${px(cy - rr)}H${px(xb + rr)}V${px(cy + rr)}H${px(xb - rr)}Z`, fill: color, z: 3, box: { x: xb - rr, y: cy - rr, w: 2 * rr, h: 2 * rr }, origin: [0.5, 0.5], tracks: toTracks }
      : { id: `${id}-to-${k}`, kind: "circle", cx: xb, cy, r: rr, fill: color, z: 3, origin: [0.5, 0.5], tracks: toTracks });
    marks.push({ id: `${id}-to-${k}`, box: { x: xb - rr, y: cy - rr, w: rr * 2, h: rr * 2 } });

    // Values on the outer side of each dot.
    const valColor: ColorRole = key ? "ink" : "inkMuted";
    const hiIsTo = rw.to >= rw.from;
    const lo = Math.min(rw.from, rw.to), hi = Math.max(rw.from, rw.to);
    const thi = vtext(hi);
    addText(`${id}-vhi-${k}`, X(hi) + rr + gap, centreInk(ctx, thi, "label", { y: cy, h: 0 }), thi, valColor, same || hiIsTo ? (same ? at : done) : at);
    if (!same) {
      const tlo = vtext(lo), wLo = ctx.measure(tlo, "label");
      addText(`${id}-vlo-${k}`, X(lo) - rr - gap - wLo, centreInk(ctx, tlo, "label", { y: cy, h: 0 }), tlo, valColor, hiIsTo ? at : done);
    }
  });

  return { out, ...faultsOf(ctx, area, texts, marks) };
}

/** Tries a label column first (one line, then two), then labels above the rows. Keeps the first layout with no fault. */
export const dumbbell: Block<DumbbellProps> = (p, ctx) => tagParts(drawDumbbell(textSafeBox(ctx, p, `dumbbell ${p.id ?? "dumbbell"}`, `use barChart (from: "top") with a series for each end`), ctx), p.id ?? "dumbbell", GESTURES.dumbbell!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawDumbbell: Block<DumbbellProps> = (p, ctx) => pick(`dumbbell ${p.id ?? "dumbbell"}`, (function* () { for (const mode of MODES) yield compose(p, ctx, mode); })());

