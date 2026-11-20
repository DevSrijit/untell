// The hand: how each design system draws a chart. A chart block reads its marks, its weights, its axis and its
// label roles here, so a bar chart in Spec does not look like a bar chart in Studio with other colours.
//
// Rules:
// - Every value is a token of the system or a multiple of one: the stroke, the radius, a type role, a colour role.
//   No literal colour, size or curve.
// - One entry for each system that has a hand of its own. A system without an entry draws the plain hand: the
//   chart blocks' look from before the hands, so a film that relies on it does not change (the Manual reel's bars).
// - No hand draws chart junk: no gridline unless the system's charts are product UI (Graphite) or tables (Raw), no
//   legend box, no axis that repeats the direct labels.
// - A hand changes how a mark looks, never what it means: bars still start at zero, values still never overshoot,
//   the key is still marked by more than colour.
import type { TypeRole } from "../../systems";
import type { ColorRole } from "../roles";
import type { Ctx } from "../types";
import { baseOf } from "../../own";

export type Hand = {
  /**
   * How a bar is drawn. "fill": a flat fill. "outline": a hairline outline on the ground, and only the key bar filled
   * (a drawing). "overprint": flat inks multiplied where they overlap, the context in the second ink (print). "cells": a row of square cells, as text-mode output draws a bar.
   */
  bar: "fill" | "outline" | "overprint" | "cells";
  /** The far end of a bar. "system": the system radius, at most a quarter of the bar (the plain look). "square". "full": a half round end. */
  end: "system" | "square" | "full";
  /** The thickest a horizontal bar may be, in line heights of its value. 0: no limit, the bars fill their rows. */
  thick: number;
  /** The gap between rows or columns, as a share of the row. Undefined: the plain gap. */
  gap?: number;
  /** The baseline's weight, in strokes. 0: no baseline (the bars share one edge, which is the baseline). */
  base: number;
  /** "auto": a value axis only when not every value prints (the plain look). "ruler": a measured scale with ticks, always. */
  axis: "auto" | "ruler";
  /** Extension marks at each bar end, as on a dimensioned drawing. */
  ends: boolean;
  /** The role of a value label, and of the key value. */
  value: TypeRole;
  key: TypeRole;
  /** The key value sits inside its bar, on the fill, when it fits. */
  inside: boolean;
  /** The colour of the context marks: "quiet" (a grey between the ground and the ink, quietRole) or a colour role. */
  context: "quiet" | ColorRole;
  /** A line chart's key line and context lines, in strokes. */
  line: number;
  thin: number;
  /** The value scale of a line or area chart. "rules": a hairline across the plot at each tick. "ticks": a short tick at the axis. "none": the labels only. */
  grid: "rules" | "ticks" | "none";
  /** The mark on a line's last point. "solid": a dot. "ring": an open circle (a measured point). "square": a square (a cell). */
  dot: "solid" | "ring" | "square";
  /** The key end label of a line or area chart. "plain": text. "pill": the current value on a pill in the key colour (product UI). */
  endLabel: "plain" | "pill";
  /** Every end label of a line or area chart takes a short leader to its point (a drawing's callouts). */
  leaders: boolean;
  /** A dimension between the key line's end and the next line's end: the gap the chart is about, measured. */
  measure: boolean;
  /** Lines step (level, then a vertical jump) instead of running straight between points: blunt. */
  step: boolean;
  /** Areas: "tint" (a flat tint of the key colour over an opaque context fill), "overprint" (each area in its own ink, multiplied, so the inks overprint where the areas cross). */
  fill: "tint" | "overprint";
  /** A system whose Direction refuses line and area charts names the block to use instead; the chart blocks warn at build. */
  refuse?: string;
  /** A rule of this hand in words, for the system's Charts section. */
  note?: string;
};

/** The plain hand: the look of the chart blocks before the hands, except the hairline gridlines, which no chart draws by default now. */
export const PLAIN: Hand = {
  bar: "fill", end: "system", thick: 1.15, base: 1, axis: "auto", ends: false, value: "label", key: "caption", inside: false,
  context: "quiet", line: 3, thin: 1.25, grid: "none", dot: "solid", endLabel: "plain", leaders: false, measure: false, step: false, fill: "tint",
};

/** The hand of each system that has one. */
export const HANDS: Record<string, Partial<Hand>> = {
  // A technical drawing: thin square bars, a hairline baseline, a measured ruler, large tabular key figures, open points.
  spec: { end: "square", thick: 0.62, gap: 0.42, base: 0.5, axis: "ruler", key: "headline", line: 2, thin: 0.75, grid: "ticks", dot: "ring", measure: true },
  // Quiet and exact: soft full ends, no baseline, no axis, two type sizes at most (the line and the labels).
  studio: { end: "full", thick: 0.78, base: 0, key: "label", line: 2.5, thin: 1, grid: "none" },
  // Type is the motion: blunt blocks that nearly touch, no baseline, the key figure large and inside its block.
  kinetic: { end: "square", thick: 0, gap: 0.08, base: 0, value: "caption", key: "headline", inside: true, line: 2, thin: 1, grid: "none", dot: "square", step: true,
    refuse: "Kinetic speaks in words, not charts: give the one number to counter (role: display), or compare with barChart (from: \"top\")",
    note: "Horizontal rows too thin for every value print only the key value, large and inside its block, and the other blocks read against a three-tick scale: one accent word per phrase, as the grammar asks. Hanging bars (`from: \"top\"`) print every value." },
  // Two inks multiplied: the context in the second ink, the key in the first, a heavy ink baseline printed through them.
  riso: { bar: "overprint", end: "square", thick: 1.5, gap: 0.3, base: 1, context: "series2", line: 2, thin: 2, grid: "none", dot: "square", fill: "overprint" },
  // Engineering hairlines: outlined bars, the key filled, extension marks at each end, a hairline baseline.
  schematic: { bar: "outline", end: "square", thick: 1, gap: 0.36, base: 0.5, ends: true, axis: "ruler", line: 1.5, thin: 0.75, grid: "ticks", dot: "ring", leaders: true },
  // Product UI: small radius, no baseline, hairline gridlines as a real product chart draws them.
  graphite: { end: "system", thick: 1, gap: 0.34, base: 0, line: 1.5, thin: 1, grid: "rules", dot: "ring", endLabel: "pill" },
  // Text-mode output: bars of square cells, no baseline, no rules.
  console: { bar: "cells", end: "square", thick: 1, gap: 0.3, base: 0, key: "label", line: 1, thin: 1, grid: "none", dot: "square" },
  // Chunky and friendly: thick full-round bars, bold values, no baseline.
  pop: { end: "full", thick: 1.6, gap: 0.28, base: 0, value: "label", key: "caption", line: 2, thin: 1, grid: "none" },
  // Geometry: square blocks on a heavy baseline.
  primary: { end: "square", thick: 1.4, gap: 0.28, base: 1, line: 1.5, thin: 1, grid: "none", dot: "square" },
  // Visible structure: outlined bars, a ruler, rules across the plot.
  raw: { bar: "outline", end: "square", thick: 1, gap: 0.3, base: 1, axis: "ruler", key: "label", line: 1, thin: 1, grid: "rules" },
  // Construction: square modules on a baseline.
  mark: { end: "square", thick: 1.2, gap: 0.3, base: 1, line: 2, thin: 1, grid: "none", dot: "square" },
};

/** The hand of the context's system. */
export function hand(ctx: Pick<Ctx, "system">): Hand {
  return { ...PLAIN, ...HANDS[baseOf(ctx.system.id)] };
}

/** The radius of a bar end of thickness `t` (px) in this hand. */
export function barEnd(ctx: Ctx, h: Hand, t: number): number {
  if (h.end === "square") return 0;
  if (h.end === "full") return t / 2;
  return Math.min(ctx.radius, t * 0.25);
}

/**
 * Tags the parts of a block that enter as one designed gesture with one `group` (types.ts): a chart's bars, its
 * values, its labels; a counter's digits; a table's row. The motion checks then count each gesture as one mover, and
 * the alignment model reads the group. A rule is [a pattern, a group name]: a string is an id prefix after `<id>-`; a
 * RegExp must match the whole id after `<id>-`, and its group name may use $1 (one group for each step, row or packet).
 * The first rule that matches wins. A node that already has a group keeps it.
 */
export function tagParts<N extends { id: string; group?: string; kind: string }>(nodes: N[], id: string, rules: [string | RegExp, string][]): N[] {
  return nodes.map((n) => {
    if (n.group || n.kind === "audio" || !n.id.startsWith(`${id}-`)) return n;
    const rest = n.id.slice(id.length + 1);
    for (const [pat, g] of rules) {
      if (typeof pat === "string" ? rest.startsWith(pat) : pat.test(rest)) return { ...n, group: `${id}-${typeof pat === "string" ? g : rest.replace(pat, g)}` };
    }
    return n;
  });
}

/** The gestures of each data and diagram block: tagParts rules, by block name. */
export const GESTURES: Record<string, [string | RegExp, string][]> = {
  stackedBar: [[/^r\d+-s\d+.*/, "segments"], [/^r\d+-(l|lead)\d+.*/, "labels"], [/^r(\d+)-(name|track).*/, "row$1"]],
  dumbbell: [[/^(ln|from|to)-.*/, "rows"], [/^(vhi|vlo)-.*/, "values"], ["cat-", "labels"], [/^(tk|tick|axis).*/, "axis"], ["k-", "key"]],
  slopeChart: [[/^(ln|da|db)-.*/, "slopes"], [/^val-l.*/, "from"], [/^(val-r|name-r).*/, "to"], ["lead-", "leads"], [/^(ax|head).*/, "axes"]],
  waffle: [[/^u\d+$/, "grid"], [/^f\d+$/, "fill"]],
  meter: [["val-", "digits"], [/^(track|fill|tick).*/, "meter"]],
  bigStat: [["num-", "digits"]],
  ranking: [[/^r\d+-bar$/, "bars"], [/^r\d+-v\d+$/, "values"], [/^(r\d+-label|rank)-.*/, "rows"], ["state-", "states"]],
  numberLine: [[/^(tick|tl)-.*/, "scale"], [/^(ml|dot)-(\d+).*/, "marker$2"]],
  timeline: [[/^(dot|ev)-(\d+).*/, "event$2"], [/^era.*/, "eras"]],
  waveform: [[/^w(\d+)-\d+$/, "lane$1"], [/^(base|label)-(\d+)$/, "lane$2"]],
  flow: [[/^n(\d+)-.*/, "node$1"], [/^h(\d+).*/, "hop$1"], [/^e\d+.*/, "edges"], [/^cap(\d+)-.*/, "caption$1"]],
  sequence: [[/^m(\d+).*/, "message$1"], [/^a(\d+)-.*/, "actor$1"], ["life", "lifelines"], [/^note(\d+).*/, "note$1"]],
  tree: [[/^n(\d+)-.*/, "node$1"], [/^[ck](\d+)$/, "link$1"]],
  cycle: [[/^a(\d+).*/, "arrow$1"], [/^s(\d+)-.*/, "step$1"], [/^note(\d+)-.*/, "note$1"]],
  steps: [[/^(\d+)-.*/, "step$1"]],
  split: [[/^p(\d+)-.*/, "side$1"], [/^h(\d+)-.*/, "side$1"]],
  matrix: [[/^cell-(\d+)-.*/, "row$1"], [/^label-(\d+)-.*/, "row$1"], [/^mark-(\d+)-.*/, "row$1"], ["head", "head"]],
};

/**
 * A block whose every mark carries its own label (a table, a slope, a diagram of labelled boxes) cannot let its marks
 * run into the 9:16 lower band, where text may not go. Given a box that reaches below the text-safe foot, it says so
 * at build, names the block that uses a tall frame for this job, and keeps to the text-safe area.
 */
export function textSafeBox<P extends { y: number; h: number }>(ctx: Ctx, p: P, name: string, use: string): P {
  const foot = ctx.safe.bottom;
  if (!(ctx.height > ctx.width) || p.y + p.h <= foot + 0.5) return p;
  console.warn(`${name}: its labels sit on its marks, so at 9:16 it keeps to the text-safe area (the lower band takes no text); for a chart that uses the lower band, ${use}`);
  return { ...p, h: Math.max(0, foot - p.y) };
}
