// Bar chart: one value per category, or a small group of values per category (grouped bars).
//
// Chart rules this block enforces:
// - A title is required. It names the measure and the unit.
// - Bars start at zero. With `base`, the axis starts at that value instead, and the baseline and every
//   bar show a break mark, so the reader sees that the bars are cut.
// - Every bar carries its value as a direct label, at the bar end. A key bar can carry its label inside
//   its fill (in `onAccent`) when that gives the bars more room. When the labels cannot fit, the block
//   labels only the key series and shows a value axis with ticks instead.
// - A bar too small to see gets a minimum visible length, and it always prints its value.
// - One edge: in columns, a category label and its value label whose left edges would sit a few px apart share
//   one left edge. Values on a bar are centred on it by their ink (layout.centreInk), not their line box.
// - The key is marked by more than colour. One series: the key bar is the only accent fill, its value is
//   set larger and in ink, and its category label is in ink. Grouped: the key series bars are full width
//   and the context series bars are narrower; the key's values are in ink, the third series is an outline.
// - Category labels never rotate. They take one line or two. When they cannot fit under vertical bars,
//   the chart turns horizontal, also when the caller asked for vertical bars.
// - Bars grow one after another on a curve that never overshoots, so no bar passes its value.
// - The block tries its layouts in order of preference. It keeps the first one in which no text
//   overlaps other text or a mark, and every text box passes `textSafe`.
// - The system draws the bars in its own hand (blocks/hand.ts): fill, outline, overprinted inks or cells; its bar
//   ends, its baseline weight, its value roles and a measured ruler where the system measures.
// - `from: "top"` (vertical bars, for a 9:16 frame): the bars hang from a rail at the top, under a row of category
//   labels and a row of values, and grow down to the foot of the box. Every label stays in the text-safe area at
//   the top, so the bars may run down into the lower band, where the platform allows marks but no text. The values
//   then sit in one row and read as a table; each bar starts under its own label.
import { appear, go, lines, px, textSafe } from "../context";
import { centreInk, centreInkLines, maskPad } from "../layout";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";
import { HANDS, barEnd, hand, tagParts, type Hand } from "./hand";
import { baseOf } from "../../own";
import { fmt, niceScale, twoLines, type Box, type Format } from "./util";

export type BarChartProps = {
  id?: string;
  /** The chart's box in px: title, labels and bars all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Surface gravity, m/s²". */
  title: string;
  categories: string[];
  /** One series for a plain bar chart. Two or three series for grouped bars. Values line up with `categories`. */
  series: { label: string; values: number[] }[];
  /** One series: the index of the key category (default: none, so no bar is the key). Grouped: the index of the key series (default 0). */
  key?: number;
  /** "auto" (default) prefers vertical bars and turns horizontal when the labels do not fit. */
  orientation?: "auto" | "vertical" | "horizontal";
  /** The value where the axis starts, when it is not zero. Every value must be above it. The axis shows a break. */
  base?: number;
  format?: Format;
  /**
   * The edge vertical bars grow from. "bottom" (default): from a baseline at the foot. "top": they hang from a rail
   * under the labels and grow down to the box's foot, which may be in the 9:16 lower band (marks only). Give a box
   * that reaches the picture-safe foot (lineAndBlock's `graphic`).
   */
  from?: "bottom" | "top";
  at: number;
  until?: number;
};

// ------------------------------------------------------------------------------------------------
// Helpers shared by the chart blocks of this group (barChart, slopeChart, dumbbell).

/**
 * The quiet role for context marks: a grey that sits clearly between the ground and the ink.
 * The series roles do not have the same order of emphasis in every system (in Pop, series4 is the ink),
 * so the block reads the system's lightness values and picks a grey about 0.3 L away from the ground.
 */
export function quietRole(ctx: Ctx): ColorRole {
  const roles = ctx.system.roles as Record<string, { l: number; c: number } | undefined>;
  const g = roles.ground!.l, ink = roles.ink!.l;
  const want = 0.3 * Math.sign(ink - g);
  let best: ColorRole = "inkMuted", err = Infinity;
  for (const r of ["series3", "series4", "series5", "series2", "inkMuted"] as ColorRole[]) {
    const v = roles[r];
    if (!v || v.c > 0.03) continue;
    const d = v.l - g;
    if (Math.sign(d) !== Math.sign(ink - g) || Math.abs(d) < 0.15) continue;
    const e = Math.abs(d - want);
    if (e < err) { err = e; best = r; }
  }
  return best;
}

/**
 * Fits a linear scale X(v) = x0 + v * k to a row of items. Each item spans the values [lo, hi] and needs
 * padLo px free before X(lo) and padHi px free after X(hi). Everything must stay inside [left, right].
 * Returns the largest k that fits, and the x0 that goes with it. A binary search is exact enough here.
 */
export function fitScale(items: { lo: number; hi: number; padLo: number; padHi: number; right: number }[], left: number): { k: number; x0: number } {
  const span = Math.max(1e-9, Math.max(...items.map((i) => i.hi)) - Math.min(...items.map((i) => i.lo)));
  const bounds = (k: number) => ({
    lo: Math.max(...items.map((i) => left + i.padLo - i.lo * k)),
    hi: Math.min(...items.map((i) => i.right - i.padHi - i.hi * k)),
  });
  let a = 0, b = (Math.max(...items.map((i) => i.right)) - left) / span;
  for (let it = 0; it < 50; it++) {
    const m = (a + b) / 2;
    const r = bounds(m);
    if (r.lo <= r.hi) a = m; else b = m;
  }
  return { k: a, x0: bounds(a).lo };
}

/**
 * The box a text paints. A plain line's glyph box can be taller than its line height (up to 1.4 x the
 * type size), and it overflows the line box equally above and below. Checks against marks, the block's
 * box and the safe area use this taller box. `lead` is the overflow on each side.
 */
export function paintedBox(ctx: Ctx, role: TypeRole, x: number, y: number, w: number): Box & { lead: number } {
  const lh = ctx.lineHeight(role), ph = Math.max(lh, ctx.size(role) * 1.4);
  return { x, y: y - (ph - lh) / 2, w, h: ph, lead: (ph - lh) / 2 };
}

export type Mark = { box: Box; id: string; /** text ids that may sit on this mark (a label inside its bar) */ allow?: string[] };
/** A text box to check. Lines of one label share a `group`; their boxes may touch inside the leading. */
export type TextBox = { box: Box; id: string; group?: string };

/**
 * The block's own check, after layout. It counts faults: a text box outside the block's box or outside
 * the text-safe area, two text boxes that overlap, and a text box that overlaps a mark.
 */
export function faultsOf(ctx: Ctx, area: Box, texts: TextBox[], marks: Mark[]): { faults: string[]; drop: string[] } {
  const e = 0.5;
  const hit = (a: Box, b: Box) => a.x < b.x + b.w - e && b.x < a.x + a.w - e && a.y < b.y + b.h - e && b.y < a.y + a.h - e;
  const out: string[] = [];
  const drop = new Set<string>(); // the texts to leave out if this layout is the last resort
  for (const t of texts) {
    const b = t.box;
    const unsafe = !textSafe(ctx, b);
    const outside = b.x < area.x - e || b.y < area.y - e || b.x + b.w > area.x + area.w + e || b.y + b.h > area.y + area.h + e;
    if (unsafe) out.push(`${t.id}: outside the text-safe area`);
    if (outside) out.push(`${t.id}: outside the block's box`);
    if (unsafe || outside) drop.add(t.id);
  }
  // Texts come in order of importance (title, key, axis, categories, values): of two that overlap, the later one goes.
  // Two texts compare by their line boxes: lines set at the system's own leading never touch in ink.
  const line = (t: TextBox) => { const l = (t.box as Box & { lead?: number }).lead ?? 0; return { x: t.box.x, y: t.box.y + l, w: t.box.w, h: t.box.h - 2 * l }; };
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (drop.has(texts[i]!.id) || drop.has(texts[j]!.id)) continue;
    if (texts[i]!.group && texts[i]!.group === texts[j]!.group) continue;
    if (hit(line(texts[i]!), line(texts[j]!))) { out.push(`${texts[i]!.id} overlaps ${texts[j]!.id}`); drop.add(texts[j]!.id); }
  }
  for (const t of texts) for (const m of marks) {
    if (m.allow?.includes(t.id)) continue;
    if (hit(t.box, m.box)) { out.push(`${t.id} overlaps ${m.id}`); drop.add(t.id); }
  }
  return { faults: out, drop: [...drop] };
}

export type Layout = { out: Node[]; faults: string[]; drop?: string[]; /** true when layout stopped early: not all nodes exist */ partial?: boolean };

/**
 * Picks a layout: the first with no fault. When every layout has faults, the complete layout with the
 * fewest faults, without the texts that cause them (a missing label is better than a label over a mark).
 */
export function pick(name: string, layouts: Iterable<Layout>): Node[] {
  let best: Layout | null = null, anyLayout: Layout | null = null;
  for (const r of layouts) {
    if (!r.faults.length) return r.out;
    anyLayout ??= r;
    if (!r.partial && (!best || r.faults.length < best.faults.length)) best = r;
  }
  const r = best ?? anyLayout!;
  console.warn(`${name}: no layout is free of faults; ${r.drop?.length ?? 0} labels left out: ${r.faults.slice(0, 4).join("; ")}`);
  const drop = new Set(r.drop ?? []);
  return r.out.filter((n) => !drop.has(n.id));
}

/** The format for axis ticks: the value format, with only as many decimals as the ticks need. */
export function tickFormat(f: Format, ticks: number[]): Format {
  const dec = Math.max(0, ...ticks.map((t) => (String(+t.toFixed(6)).split(".")[1] ?? "").length));
  return { ...f, decimals: dec };
}

/** A filled rectangle path with its far end rounded. `dir` is the direction in which the bar grows. */
export function barPath(x: number, y: number, w: number, h: number, r: number, dir: "up" | "down" | "right" | "left"): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const X = x + w, Y = y + h;
  const P = (n: number) => px(n);
  if (r < 0.5) return `M${P(x)} ${P(y)}H${P(X)}V${P(Y)}H${P(x)}Z`;
  const a = (ex: number, ey: number) => `A${r} ${r} 0 0 1 ${P(ex)} ${P(ey)}`;
  switch (dir) {
    case "up": return `M${P(x)} ${P(Y)}V${P(y + r)}${a(x + r, y)}H${P(X - r)}${a(X, y + r)}V${P(Y)}Z`;
    case "down": return `M${P(X)} ${P(y)}V${P(Y - r)}${a(X - r, Y)}H${P(x + r)}${a(x, Y - r)}V${P(y)}Z`;
    case "right": return `M${P(x)} ${P(y)}H${P(X - r)}${a(X, y + r)}V${P(Y - r)}${a(X - r, Y)}H${P(x)}Z`;
    case "left": return `M${P(X)} ${P(Y)}H${P(x + r)}${a(x, Y - r)}V${P(y + r)}${a(x + r, y)}H${P(X)}Z`;
  }
}

/** The right edge that text may reach in a band of rows: the low band at 9:16 is narrower. */
export const rightLimit = (ctx: Ctx, boxRight: number, bottom: number) => Math.min(boxRight, bottom > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right);

/** Lays a title out as one line, or two when one line does not fit the width. */
export function titleLines(ctx: Ctx, title: string, w: number): string[] {
  return ctx.measure(title, "label") <= w ? [title] : (twoLines(title) ?? [title]);
}

/** The space a masked label line needs above its line box, so its mask stays inside the block's box. */
export const titlePad = (ctx: Ctx) => maskPad(ctx.system, "label", Math.min(ctx.width, ctx.height)).top;

// ------------------------------------------------------------------------------------------------

type Mode = { dir: "v" | "h"; cat: 1 | 2; above: boolean; labels: "all" | "key"; hang?: boolean };

const MODES = (o: BarChartProps["orientation"], from: BarChartProps["from"]): Mode[] => {
  const all: Mode[] = [];
  if (from === "top" && o !== "horizontal") all.push({ dir: "v", cat: 1, above: false, labels: "all", hang: true }, { dir: "v", cat: 2, above: false, labels: "all", hang: true });
  for (const labels of ["all", "key"] as const) {
    if (o !== "horizontal") all.push({ dir: "v", cat: 1, above: false, labels }, { dir: "v", cat: 2, above: false, labels });
    all.push({ dir: "h", cat: 1, above: false, labels }, { dir: "h", cat: 2, above: false, labels }, { dir: "h", cat: 1, above: true, labels }, { dir: "h", cat: 2, above: true, labels });
  }
  return all;
};

function compose(p: BarChartProps, ctx: Ctx, mode: Mode, keyRole?: TypeRole): Layout {
  const id = p.id ?? "bars";
  const f = p.format ?? {};
  const n = p.categories.length;
  const S = Math.max(1, Math.min(3, p.series.length));
  const grouped = S > 1;
  const keyIdx = p.key;
  const keySeries = grouped ? (keyIdx ?? 0) : 0;
  const isKey = (c: number, s: number) => (grouped ? s === keySeries : keyIdx === undefined || c === keyIdx);
  const H: Hand = hand(ctx);
  const quiet: ColorRole = H.context === "quiet" ? quietRole(ctx) : H.context;
  const out: Node[] = [];
  const texts: TextBox[] = [];
  const marks: Mark[] = [];
  const area = { x: p.x, y: p.y, w: p.w, h: p.h };

  const sL = ctx.size("label"), lhL = ctx.lineHeight("label");
  // Hanging bars set their values in one row, as a table: a key value larger than caption would break the row, so
  // the row takes caption at most there (a layout rule, not a shrink: no warning).
  const big = (r: TypeRole) => r === "display" || r === "headline" || r === "body";
  const KR = mode.hang && big(keyRole ?? H.key) ? "caption" : keyRole ?? H.key;
  const valRole = (c: number, _s: number): TypeRole => (!grouped && keyIdx !== undefined && c === keyIdx ? KR : H.value);
  const lhV = Math.max(ctx.lineHeight(H.value), !grouped && keyIdx !== undefined ? ctx.lineHeight(KR) : 0);
  const gap = Math.round(sL * 0.35); // between a bar end and its value
  const minLen = Math.max(3, ctx.stroke * 2); // the shortest bar drawn for a tiny value
  const base = p.base ?? 0;
  const broken = p.base !== undefined && p.base !== 0;
  const vals = p.series.slice(0, S).map((s) => p.categories.map((_, c) => s.values[c] ?? 0));
  const flat = vals.flat();
  const hasNeg = flat.some((v) => v < base), hasPos = flat.some((v) => v > base);

  const t0 = p.at, exit = p.until;
  const fade = (at: number) => appear(ctx, at, exit, 0);
  const addText = (tid: string, x: number, y: number, text: string, role: TypeRole, color: ColorRole, at: number, group?: string) => {
    const w = ctx.measure(text, role);
    out.push({ id: tid, kind: "text", x, y, text, role, color, tracks: fade(at) });
    texts.push({ id: tid, box: paintedBox(ctx, role, x, y, w), group });
  };

  // Title, and for grouped bars a one-line key of swatches under it.
  // A box wider than the text-safe area (a graphic box at 9:16) keeps its text inside the text-safe columns.
  const TX = Math.max(p.x, ctx.safe.left);
  const tl = titleLines(ctx, p.title, Math.min(p.x + p.w, ctx.safe.right) - TX);
  const ty = p.y + titlePad(ctx);
  out.push(...lines(ctx, { id: `${id}-title`, x: TX, y: ty, lines: tl, role: "label", color: "inkMuted", at: t0, until: exit }));
  tl.forEach((l, i) => texts.push({ id: `${id}-title-${i}`, box: { x: TX, y: ty + i * lhL, w: ctx.measure(l, "label"), h: lhL }, group: "title" }));
  let top = ty + lhL * (tl.length + 0.9);
  const sw = Math.round(sL * 0.62);
  const fillOf = (c: number, s: number): { fill: ColorRole; stroke?: ColorRole } =>
    isKey(c, s) ? { fill: "series1" } : grouped && s === (keySeries === 2 ? 1 : 2) ? { fill: "ground", stroke: quiet } : { fill: quiet };
  if (grouped) {
    let kx = p.x;
    for (let s = 0; s < S; s++) {
      const name = p.series[s]!.label;
      const lw = ctx.measure(name, "label");
      if (kx + sw + gap + lw > p.x + p.w && kx > p.x) { kx = p.x; top += lhL * 1.25; }
      const st = fillOf(-1, s);
      const sy = top + (lhL - sw) / 2;
      out.push({ id: `${id}-sw-${s}`, kind: "path", d: barPath(kx, sy, sw, sw, 0, "up"), fill: st.fill, stroke: st.stroke, width: st.stroke ? ctx.stroke : undefined, tracks: fade(t0 + ctx.dur.stagger) });
      marks.push({ id: `${id}-sw-${s}`, box: { x: kx, y: sy, w: sw, h: sw } });
      addText(`${id}-swl-${s}`, kx + sw + gap, top, name, "label", s === keySeries ? "ink" : "inkMuted", t0 + ctx.dur.stagger);
      kx += sw + gap + lw + sL * 1.2;
    }
    top += lhL * 1.5;
  }

  // Which bars print their value. In "key" mode the key series prints, and so does every tiny bar.
  const bottom = p.y + p.h;
  const valueText = (c: number, s: number) => fmt(vals[s]![c]!, f);
  const catText = p.categories;
  // Two lines only where both halves are words: "10 %" never breaks into "10" over "%".
  const split = (t: string) => { const two = twoLines(t); return two && two.every((x) => x.length > 1) ? [...two] : [t]; };
  const catLinesOf = (c: number) => (mode.cat === 2 ? split(catText[c]!) : [catText[c]!]);
  const catW = (c: number) => Math.max(...catLinesOf(c).map((l) => ctx.measure(l, "label")));
  const catColor = (c: number): ColorRole => (!grouped && keyIdx !== undefined && c === keyIdx ? "ink" : "inkMuted");
  const barStart = t0 + ctx.dur.enter + ctx.dur.stagger * 2;
  const step = Math.min(ctx.dur.stagger * 2, 1.4 / Math.max(1, n * S));
  const grow = ctx.dur.move;
  const order = (c: number, s: number) => c * S + s;
  const solo = grouped && mode.labels === "key";
  // In grouped bars the context series are drawn narrower than the key series, so the key reads without colour.
  const inset = (c: number, s: number) => (grouped && !isKey(c, s) ? 0.18 : 0);

  const growTrack = (at: number, prop: "scaleX" | "scaleY") => ({ [prop]: go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move") });

  /**
   * One bar in the system's hand. `b` is the bar's box, `dir` the way it grows, `t` its thickness (for its end).
   * Fill: one path (the plain look). Outline: the context bar is a hairline outline on the ground. Overprint: flat
   * ink, multiplied, so the ink baseline prints through it. Cells: square cells; the last cell is cut at the value,
   * so the bar's length stays true.
   */
  const drawBar = (bid: string, b: Box, dir: "up" | "down" | "right" | "left", st: { fill: ColorRole; stroke?: ColorRole }, key: boolean, at: number) => {
    const horiz = dir === "right" || dir === "left";
    const t = horiz ? b.h : b.w;
    const origin: [number, number] = horiz ? [dir === "right" ? 0 : 1, 0.5] : [0.5, dir === "up" ? 1 : 0];
    const tracks = { ...growTrack(at, horiz ? "scaleX" : "scaleY"), ...fade(at) };
    const r = barEnd(ctx, H, t);
    if (H.bar === "cells" && !st.stroke) {
      const len = horiz ? b.w : b.h, pitch = t * 1.25;
      let d = "";
      for (let a = 0; a < len - 0.5; a += pitch) {
        const l = Math.min(t, len - a);
        if (horiz) { const x = dir === "right" ? b.x + a : b.x + b.w - a - l; d += `M${px(x)} ${px(b.y)}H${px(x + l)}V${px(b.y + b.h)}H${px(x)}Z`; }
        else { const y = dir === "down" ? b.y + a : b.y + b.h - a - l; d += `M${px(b.x)} ${px(y)}H${px(b.x + b.w)}V${px(y + l)}H${px(b.x)}Z`; }
      }
      out.push({ id: bid, kind: "path", d, fill: st.fill, z: 1, box: b, origin, tracks });
      return;
    }
    if (H.bar === "outline" && !key && !st.stroke) {
      const w = Math.max(1, ctx.stroke * 0.75), i = w / 2;
      out.push({ id: bid, kind: "path", d: barPath(b.x + i, b.y + i, b.w - w, b.h - w, r, dir), fill: "ground", stroke: "inkMuted", width: w, z: 1, box: b, origin, tracks });
      return;
    }
    if (H.bar === "overprint" && !st.stroke) {
      out.push({ id: bid, kind: "path", d: barPath(b.x, b.y, b.w, b.h, r, dir), fill: st.fill, blend: "multiply", z: 1, box: b, origin, tracks });
      return;
    }
    out.push({ id: bid, kind: "path", d: barPath(b.x, b.y, b.w, b.h, r, dir), fill: st.fill, stroke: st.stroke, width: st.stroke ? ctx.stroke : undefined, z: 1, box: b, origin, tracks });
  };
  /** Extension marks at a bar's end, as on a dimensioned drawing (a hand with `ends`). */
  const endMark = (bid: string, b: Box, dir: "up" | "down" | "right" | "left", at: number) => {
    if (!H.ends) return;
    const horiz = dir === "right" || dir === "left", t = horiz ? b.h : b.w, e = t * 0.3;
    const d = horiz ? `M${px(dir === "right" ? b.x + b.w : b.x)} ${px(b.y - e)}V${px(b.y + b.h + e)}` : `M${px(b.x - e)} ${px(dir === "up" ? b.y : b.y + b.h)}H${px(b.x + b.w + e)}`;
    out.push({ id: `${bid}-end`, kind: "path", d, stroke: "ink", width: Math.max(1, ctx.stroke * 0.5), z: 3, tracks: fade(at + grow) });
  };
  const baseW = ctx.stroke * H.base;

  if (mode.hang) {
    // ---------------------------------------------------------------- vertical bars that hang from a rail
    // The text sits in rows at the top, in the text-safe columns: the category labels, then the values. The bars
    // hang from a rail under them and grow down to the foot of the box (the lower band at 9:16 takes marks).
    if (broken || hasNeg) return { out, partial: true, faults: ["hanging bars take no negative values and no cut axis"] };
    const catY = top;
    const valY = catY + lhL * mode.cat + sL * 0.15;
    const rail = valY + lhV + gap * 1.5;
    // The label rows end by the low band's right edge when they reach into it.
    const L0 = TX, R = rightLimit(ctx, p.x + p.w, valY + lhV);
    const slot = (R - L0) / n;
    const groupW = slot * (H.gap !== undefined ? 1 - H.gap : grouped ? 0.8 : 0.7);
    const inner = grouped ? Math.max(2, slot * 0.03) : 0;
    const barW = (groupW - inner * (S - 1)) / S;
    const foot = bottom - Math.max(baseW, 1);
    const dmax = Math.max(...flat);
    if (foot - rail < lhV * 4) return { out, partial: true, faults: ["no room for the hanging bars"] };
    const len0 = (v: number) => (v / (dmax || 1)) * (foot - rail);
    if (baseW > 0) out.push({ id: `${id}-base`, kind: "path", d: `M${px(L0)} ${px(rail)}H${px(L0 + slot * n)}`, stroke: "ink", width: baseW, z: 3,
      tracks: { draw: go(ctx, t0 + ctx.dur.stagger, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger) } });
    marks.push({ id: `${id}-rail`, box: { x: L0, y: rail - Math.max(1, baseW) / 2, w: slot * n, h: Math.max(1, baseW) } });
    for (let c = 0; c < n; c++) {
      const cx = L0 + slot * (c + 0.5);
      if (catW(c) > slot - sL * 0.3) return { out, partial: true, faults: [`category ${c} is too wide for its slot`] };
      catLinesOf(c).forEach((l, k) => addText(`${id}-cat-${c}-${k}`, cx - ctx.measure(l, "label") / 2, catY + k * lhL, l, "label", catColor(c), t0 + ctx.dur.stagger * (2 + c * 0.5), `cat-${c}`));
      for (let s = 0; s < S; s++) {
        const v = vals[s]![c]!;
        const bx = L0 + slot * c + (slot - groupW) / 2 + s * (barW + inner);
        const l0 = len0(v), len = v !== 0 && l0 < minLen ? minLen : l0;
        const at = barStart + order(c, s) * step;
        const bid = `${id}-bar-${c}-${s}`;
        const ins = inset(c, s) * barW, bw = barW - 2 * ins;
        if (len > 0) {
          drawBar(bid, { x: bx + ins, y: rail, w: bw, h: len }, "down", fillOf(c, s), isKey(c, s), at);
          endMark(bid, { x: bx + ins, y: rail, w: bw, h: len }, "down", at);
          marks.push({ id: bid, box: { x: bx + ins, y: rail, w: bw, h: len } });
        }
        // The value heads its bar: it comes with the bar, as the bar leaves the rail.
        const role = valRole(c, s), text = valueText(c, s), lw = ctx.measure(text, role);
        if (lw > slot / S - sL * 0.15 && grouped) return { out, partial: true, faults: [`value ${c}/${s} is too wide for its bar`] };
        if (lw > slot - sL * 0.2) return { out, partial: true, faults: [`value ${c}/${s} is too wide for its slot`] };
        const vx = grouped ? bx + barW / 2 - lw / 2 : cx - lw / 2;
        addText(`${id}-val-${c}-${s}`, vx, valY + (lhV - ctx.lineHeight(role)), text, role, isKey(c, s) ? "ink" : "inkMuted", at);
      }
    }
    return { out, ...faultsOf(ctx, area, texts, marks) };
  }

  if (mode.dir === "v") {
    // ---------------------------------------------------------------- vertical bars
    const R = rightLimit(ctx, p.x + p.w, bottom);
    const catH = lhL * mode.cat + sL * 0.65; // the painted glyph box reaches a little below the line box
    const labelled = (c: number, s: number, len0: number, v0: number) => mode.labels === "all" || isKey(c, s) || (v0 !== base && len0 < minLen);
    // A value axis on the left in "key" mode; the base value on the left when the axis is broken.
    const plotTop = top + (hasPos ? lhV + gap : 0);
    const plotBottom = bottom - catH - (hasNeg ? lhV + gap : 0);
    let dmin = broken ? base : Math.min(0, ...flat), dmax = Math.max(base, ...flat);
    let ticks: number[] = [];
    if (mode.labels === "key") {
      const sc = niceScale(dmin, dmax, 4);
      ticks = sc.ticks.filter((t) => t >= dmin - 1e-9);
      dmax = Math.max(dmax, sc.max);
      if (!broken) dmin = Math.min(dmin, sc.min);
    } else if (broken) ticks = [base];
    const tf = tickFormat(f, ticks);
    const gutter = ticks.length ? Math.max(...ticks.map((t) => ctx.measure(fmt(t, tf), "label"))) + sL * 0.6 : 0;
    const plotX = p.x + gutter;
    const slot = Math.min((R - plotX) / n, H.thick > 0 ? sL * (grouped ? 7 : 5) : Infinity);
    const groupW = slot * (H.gap !== undefined ? 1 - H.gap : grouped ? 0.8 : 0.7);
    const inner = grouped ? Math.max(2, slot * 0.03) : 0;
    const barW = (groupW - inner * (S - 1)) / S;
    const Y = (v: number) => plotBottom - ((v - dmin) / (dmax - dmin || 1)) * (plotBottom - plotTop);
    const y0 = Y(base);
    const plotEnd = plotX + slot * n;
    if (plotBottom - plotTop < lhV * 2) return { out, partial: true, faults: ["no room for the bars"] };

    // Baseline, and the break mark when the axis does not start at zero.
    if (baseW > 0) out.push({ id: `${id}-base`, kind: "path", d: `M${px(plotX)} ${px(y0)}H${px(plotEnd)}`, stroke: "ink", width: baseW, z: 3,
      tracks: { draw: go(ctx, t0 + ctx.dur.stagger, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger) } });
    marks.push({ id: `${id}-base`, box: { x: plotX, y: y0 - ctx.stroke, w: plotEnd - plotX, h: ctx.stroke * 2 } });
    ticks.forEach((t, i) => {
      const ty = Y(t), label = fmt(t, tf), lw = ctx.measure(label, "label");
      addText(`${id}-tick-${i}`, plotX - sL * 0.6 - lw, centreInk(ctx, label, "label", { y: ty, h: 0 }), label, "label", "inkMuted", t0 + ctx.dur.stagger * (2 + i));
      if (t !== base) out.push({ id: `${id}-tk-${i}`, kind: "path", d: `M${px(plotX - sL * 0.3)} ${px(ty)}H${px(plotX)}`, stroke: "rule", width: ctx.stroke * 0.5, tracks: fade(t0 + ctx.dur.stagger) });
    });
    if (broken) {
      const s = sL * 0.3, bx = plotX + (slot - groupW) / 4;
      out.push({ id: `${id}-brk`, kind: "path", d: `M${px(bx - s)} ${px(y0 + s)}L${px(bx)} ${px(y0 - s)}M${px(bx)} ${px(y0 + s)}L${px(bx + s)} ${px(y0 - s)}`, stroke: "ink", width: ctx.stroke, z: 3, tracks: fade(t0 + ctx.dur.stagger) });
    }

    // Category labels under the plot, centred on their slot.
    const catY = bottom - catH + sL * 0.5;
    // One edge: a one-line category label and its column's value label, both centred on the slot, whose left edges
    // would sit less than a third of the label size apart, share the left edge of the wider one. An edge a few px
    // off reads as an error; the centre moves by half that gap at most.
    const edge = new Map<number, number>();
    for (let c = 0; c < n; c++) {
      const cx = plotX + slot * (c + 0.5);
      if (catW(c) > slot - sL * 0.3) return { out, partial: true, faults: [`category ${c} is too wide for its slot`] };
      const cl = catLinesOf(c);
      if (S === 1 && cl.length === 1) {
        const cx0 = cx - ctx.measure(cl[0]!, "label") / 2, vx0 = cx - ctx.measure(valueText(c, 0), valRole(c, 0)) / 2;
        if (Math.abs(cx0 - vx0) > 0.01 && Math.abs(cx0 - vx0) < sL * 0.35) edge.set(c, Math.min(cx0, vx0));
      }
      cl.forEach((l, k) => {
        const lw = ctx.measure(l, "label");
        addText(`${id}-cat-${c}-${k}`, edge.get(c) ?? cx - lw / 2, catY + k * lhL, l, "label", catColor(c), t0 + ctx.dur.stagger * (2 + c * 0.5), `cat-${c}`);
      });
    }

    // Bars, then their values.
    for (let c = 0; c < n; c++) for (let s = 0; s < S; s++) {
      const v = vals[s]![c]!;
      const bx = plotX + slot * c + (slot - groupW) / 2 + s * (barW + inner);
      const len0 = Math.abs(Y(v) - y0);
      let len = len0;
      if (v !== base && len < minLen) len = minLen;
      const up = v >= base;
      const at = barStart + order(c, s) * step;
      const bid = `${id}-bar-${c}-${s}`;
      const st = fillOf(c, s);
      if (len > 0) {
        const by = up ? y0 - len : y0;
        const ins = inset(c, s) * barW, bw = barW - 2 * ins;
        drawBar(bid, { x: bx + ins, y: by, w: bw, h: len }, up ? "up" : "down", st, isKey(c, s), at);
        endMark(bid, { x: bx + ins, y: by, w: bw, h: len }, up ? "up" : "down", at);
        marks.push({ id: bid, box: { x: bx + ins, y: by, w: bw, h: len } });
        if (broken) {
          const bh = ctx.stroke * 2.5, by2 = y0 - Math.min(len * 0.35, sL * 0.8), sl = barW * 0.18;
          out.push({ id: `${bid}-cut`, kind: "path", d: `M${px(bx - 1)} ${px(by2 + sl)}L${px(bx + barW + 1)} ${px(by2 - sl)}V${px(by2 - sl - bh)}L${px(bx - 1)} ${px(by2 + sl - bh)}Z`, fill: "ground", z: 2, tracks: fade(at + grow) });
        }
      }
      if (!labelled(c, s, len0, v)) continue;
      const role = valRole(c, s), text = valueText(c, s), lw = ctx.measure(text, role), lh = ctx.lineHeight(role);
      if (lw > slot - sL * 0.2) return { out, partial: true, faults: [`value ${c}/${s} is too wide for its slot`] };
      // With only the key series labelled, the label clears every bar of its group on that side.
      const reach = solo ? Math.max(len, ...vals.map((sv) => sv[c]!).filter((w) => (w >= base) === up).map((w) => Math.abs(Y(w) - y0))) : len;
      const ly = up ? y0 - reach - gap - lh : y0 + reach + gap;
      const lx = S === 1 && edge.has(c) ? edge.get(c)! : Math.max(plotX + slot * c, Math.min(bx + barW / 2 - lw / 2, plotX + slot * (c + 1) - lw));
      addText(`${id}-val-${c}-${s}`, lx, ly, text, role, isKey(c, s) && role === "caption" ? "ink" : isKey(c, s) ? "ink" : "inkMuted", at + grow);
    }
  } else {
    // ---------------------------------------------------------------- horizontal bars
    const ruler = mode.labels === "key" || H.axis === "ruler";
    const axisRow = ruler || broken;
    const axisH = axisRow ? lhL + sL * (broken ? 0.9 : 0.6) : 0;
    // Rows that fill the box (a hand with no thickness limit) keep the painted glyph box of the last row's labels
    // inside the box: filled rows put the last label's foot on its edge. Other hands keep the plain rows.
    const avail = bottom - top - axisH - (HANDS[baseOf(ctx.system.id)] && H.thick === 0 ? Math.max(0, ctx.size(KR) * 1.4 - lhV, sL * 0.4) : 0);
    const catLH = mode.above ? lhL * mode.cat + sL * 0.3 : 0;
    let rowH = avail / n;
    const rowGap = H.gap !== undefined ? rowH * H.gap : Math.min(sL * 0.45, rowH * 0.22);
    const maxThick = H.thick > 0 ? lhV * H.thick : Infinity;
    let thick = (rowH - catLH - rowGap - (S - 1) * 2) / S;
    if (thick > maxThick) { thick = maxThick; rowH = catLH + rowGap + S * thick + (S - 1) * 2; }
    const inner = 2;
    const groupH = S * thick + (S - 1) * inner;
    if (thick < sL * 0.3) return { out, partial: true, faults: ["rows too thin"] };
    const colW = mode.above ? 0 : Math.max(...p.categories.map((_, c) => catW(c)));
    const colGap = sL * (hasNeg ? 1.4 : 0.6); // more air when negative values sit next to the labels
    const plotL = p.x + (mode.above ? 0 : colW + colGap);
    if (!mode.above && colW > p.w * 0.56) return { out, partial: true, faults: ["label column too wide"] };
    if (!mode.above && mode.cat * lhL > rowH + 0.5) return { out, partial: true, faults: ["two-line labels do not fit the row"] };
    const rowTop = (c: number) => top + c * rowH;
    const barY = (c: number, s: number) => rowTop(c) + catLH + (mode.above ? 0 : rowGap / 2) + s * (thick + inner);
    const labelled = (c: number, s: number) => mode.labels === "all" || isKey(c, s);

    // Fit the scale with every printed value outside its bar. Then try key values inside their bars:
    // keep that when it gives the bars at least 4 % more length.
    const items = (inside: boolean) => {
      const its: { lo: number; hi: number; padLo: number; padHi: number; right: number; c: number; s: number; lw: number }[] = [];
      for (let c = 0; c < n; c++) for (let s = 0; s < S; s++) {
        const v = vals[s]![c]!, show = labelled(c, s);
        const role = valRole(c, s), lw = ctx.measure(valueText(c, s), role);
        const pad = show && !(inside && isKey(c, s)) ? gap + lw + minLen : minLen;
        const right = rightLimit(ctx, p.x + p.w, barY(c, s) + thick / 2 + ctx.lineHeight(role) / 2);
        const g = solo ? vals.map((sv) => sv[c]!).filter((w) => (w >= base) === (v >= base)) : [v];
        its.push({ lo: Math.min(base, ...g), hi: Math.max(base, ...g), padLo: v < base ? pad : 0, padHi: v >= base ? pad : 0, right, c, s, lw });
      }
      // The axis row: tick labels centred on their ticks must fit too.
      return its;
    };
    const fitOut = fitScale(items(false), plotL);
    let fit = fitOut, inside = false;
    const ip = sL * 0.4;
    if (keyIdx !== undefined || grouped) {
      const its = items(true);
      const fitIn = fitScale(its, plotL);
      // A label inside a bar must fit its length and its thickness. This holds for one series too: a large key value
      // in a thin bar went past the bar's edges, in the bar's ink colour on the ground.
      const ok = its.every((i) => !isKey(i.c, i.s) || !labelled(i.c, i.s)
        || (Math.abs(vals[i.s]![i.c]! - base) * fitIn.k >= i.lw + ip * 2 && ctx.lineHeight(valRole(i.c, i.s)) <= thick + inner));
      if (ok && (fitIn.k > fitOut.k * 1.04 || (H.inside && fitIn.k >= fitOut.k))) { fit = fitIn; inside = true; }
    }
    const X = (v: number) => fit.x0 + v * fit.k;
    const x0 = X(base);
    if (fit.k <= 0) return { out, partial: true, faults: ["no room for the bars"] };

    // Baseline (one line in column mode; one short line per row when labels sit above the bars, so no label crosses it).
    const lastY = barY(n - 1, S - 1) + thick;
    if (mode.above) {
      for (let c = 0; c < n; c++) {
        const yA = barY(c, 0), yB = barY(c, S - 1) + thick + sL * 0.1;
        if (baseW > 0) out.push({ id: `${id}-base-${c}`, kind: "path", d: `M${px(x0)} ${px(yA)}V${px(yB)}`, stroke: "ink", width: baseW, z: 3,
          tracks: { draw: go(ctx, t0 + ctx.dur.stagger, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger) } });
        marks.push({ id: `${id}-base-${c}`, box: { x: x0 - ctx.stroke, y: yA, w: ctx.stroke * 2, h: yB - yA } });
      }
    } else {
      const yA = top - sL * 0.2, yB = lastY + sL * 0.2;
      if (baseW > 0) out.push({ id: `${id}-base`, kind: "path", d: `M${px(x0)} ${px(yA)}V${px(yB)}`, stroke: "ink", width: baseW, z: 3,
        tracks: { draw: go(ctx, t0 + ctx.dur.stagger, 0, 1, "move"), ...fade(t0 + ctx.dur.stagger) } });
      marks.push({ id: `${id}-base`, box: { x: x0 - ctx.stroke, y: yA, w: ctx.stroke * 2, h: yB - yA } });
    }

    // The axis row: the base value when the axis is broken, ticks in "key" mode.
    if (axisRow) {
      const ay = lastY + sL * (broken ? 0.9 : 0.6);
      const maxV = Math.max(base, ...flat), minV = broken ? base : Math.min(0, ...flat);
      const ticks = ruler ? niceScale(minV, maxV, 4).ticks.filter((t) => t >= minV - 1e-9 && t <= maxV + 1e-9) : [base];
      const R = rightLimit(ctx, p.x + p.w, ay + lhL);
      let lastEnd = -Infinity;
      ticks.forEach((t, i) => {
        const label = fmt(t, tickFormat(f, ticks)), lw = ctx.measure(label, "label"), tx = X(t);
        const lx = Math.max(p.x, Math.min(tx - lw / 2, R - lw));
        if (lx < lastEnd + sL * 0.8 || Math.abs(lx + lw / 2 - tx) > lw * 0.5) return;
        lastEnd = lx + lw;
        addText(`${id}-tick-${i}`, lx, ay, label, "label", "inkMuted", t0 + ctx.dur.stagger * (2 + i));
        if (t !== base) {
          out.push({ id: `${id}-tk-${i}`, kind: "path", d: `M${px(tx)} ${px(lastY + sL * 0.05)}V${px(lastY + sL * 0.35)}`, stroke: "rule", width: ctx.stroke * 0.5, tracks: fade(t0 + ctx.dur.stagger) });
        }
      });
      if (ruler) {
        const xa = X(minV), xb = X(Math.max(maxV, ...ticks));
        out.push({ id: `${id}-axis`, kind: "path", d: `M${px(xa)} ${px(lastY + sL * 0.05)}H${px(xb)}`, stroke: "rule", width: ctx.stroke * 0.5, tracks: fade(t0 + ctx.dur.stagger) });
      }
    }
    if (broken) {
      const s = sL * 0.3, by = lastY + sL * 0.2;
      out.push({ id: `${id}-brk`, kind: "path", d: `M${px(x0 - s)} ${px(by + s * 0.2)}L${px(x0 + s)} ${px(by - s * 0.8)}M${px(x0 - s)} ${px(by + s)}L${px(x0 + s)} ${px(by)}`, stroke: "ink", width: ctx.stroke, z: 3, tracks: fade(t0 + ctx.dur.stagger) });
    }

    for (let c = 0; c < n; c++) {
      // Category label: in a column left of the bars, centred on the group; or on its own line above the bars.
      const cl = catLinesOf(c);
      const cy = mode.above ? rowTop(c) : centreInkLines(ctx, cl, "label", { y: barY(c, 0), h: groupH }, lhL);
      cl.forEach((l, k) => {
        const lw = ctx.measure(l, "label");
        const lx = mode.above ? plotL : plotL - colGap - lw;
        addText(`${id}-cat-${c}-${k}`, lx, cy + k * lhL, l, "label", catColor(c), t0 + ctx.dur.stagger * (2 + c * 0.5), `cat-${c}`);
      });
      for (let s = 0; s < S; s++) {
        const v = vals[s]![c]!;
        const len0 = Math.abs(X(v) - x0);
        let len = len0;
        if (v !== base && len < minLen) len = minLen;
        const right = v >= base;
        const by = barY(c, s);
        const bx = right ? x0 : x0 - len;
        const at = barStart + order(c, s) * step;
        const bid = `${id}-bar-${c}-${s}`;
        const st = fillOf(c, s);
        if (len > 0) {
          const ins = inset(c, s) * thick, bt = thick - 2 * ins;
          drawBar(bid, { x: bx, y: by + ins, w: len, h: bt }, right ? "right" : "left", st, isKey(c, s), at);
          endMark(bid, { x: bx, y: by + ins, w: len, h: bt }, right ? "right" : "left", at);
          if (broken) {
            const bw = ctx.stroke * 2.5, bx2 = x0 + Math.min(len * 0.35, sL * 0.8), sl = thick * 0.18;
            out.push({ id: `${bid}-cut`, kind: "path", d: `M${px(bx2 - sl)} ${px(by + thick + 1)}L${px(bx2 + sl)} ${px(by - 1)}H${px(bx2 + sl + bw)}L${px(bx2 - sl + bw)} ${px(by + thick + 1)}Z`, fill: "ground", z: 2, tracks: fade(at + grow) });
          }
        }
        const show = labelled(c, s) || (v !== base && len0 < minLen);
        const tid = `${id}-val-${c}-${s}`;
        marks.push({ id: bid, box: { x: bx, y: by, w: len, h: thick }, allow: [tid] });
        if (!show) continue;
        const role = valRole(c, s), text = valueText(c, s), lw = ctx.measure(text, role);
        const inBar = inside && isKey(c, s) && len >= lw + ip * 2;
        // With only the key series labelled, the label clears every bar of its group on that side.
        const reach = solo && !inBar ? Math.max(len, ...vals.map((sv) => sv[c]!).filter((w) => (w >= base) === right).map((w) => Math.abs(X(w) - x0))) : len;
        const end = right ? x0 + reach : x0 - reach;
        const lx = inBar ? (right ? bx + len - ip - lw : bx + ip) : right ? end + gap : end - gap - lw;
        const cy = solo && !inBar ? barY(c, 0) + groupH / 2 : by + thick / 2;
        // The value's ink (not its line box) is centred on the bar.
        addText(tid, lx, centreInk(ctx, text, role, { y: cy, h: 0 }), text, role, inBar ? "onAccent" : isKey(c, s) ? "ink" : "inkMuted", at + grow);
      }
    }
  }
  return { out, ...faultsOf(ctx, area, texts, marks) };
}

/**
 * Tries each layout in order of preference: vertical bars, then horizontal bars with a label column,
 * then horizontal bars with each label above its bar; first with every value printed, then with only
 * the key values and a value axis. It keeps the first layout with no fault.
 */
const PARTS: [string, string][] = [["bar-", "bars"], ["val-", "values"], ["cat-", "labels"], ["tick-", "axis"], ["tk-", "axis"], ["axis", "axis"], ["sw", "key"]];

export const barChart: Block<BarChartProps> = (p, ctx) => tagParts(drawBars(p, ctx), p.id ?? "bars", PARTS);

function drawBars(p: BarChartProps, ctx: Ctx): Node[] {
  const name = `barChart ${p.id ?? "bars"}`;
  const K = hand(ctx).key;
  // A hand that sets the key value large (Spec: headline) falls back to caption in a box too small for it, and says so.
  const roles: TypeRole[] = K === "caption" || K === "label" || p.key === undefined ? [K] : [K, "caption"];
  for (const role of roles.slice(0, -1)) {
    for (const mode of MODES(p.orientation, p.from)) {
      const r = compose(p, ctx, mode, role);
      if (!r.faults.length) return r.out;
    }
  }
  const last = roles[roles.length - 1]!;
  if (last !== K) console.warn(`${name}: the key value is set in ${last}, not ${K}: the box is too small for the system's key size`);
  return pick(name, (function* () { for (const mode of MODES(p.orientation, p.from)) yield compose(p, ctx, mode, last); })());
}

