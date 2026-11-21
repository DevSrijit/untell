// Big stat: one large number, the label that says what it counts, and an optional change.
//
// Rules this block enforces:
// - The number takes the largest role (display, headline, body) that fits the box beside its label
//   and its change line. It never scales: it steps down a role, and last of all the counter's
//   compact form (1.28M) takes over.
// - The label wraps to two lines when it is wider than the box.
// - A change shows its direction three ways: a sign (+ or −), a word (up, down, no change) and a
//   drawn triangle. The triangle's colour (positive or negative) is extra, never the only signal.
//   `good` says which direction is good, so a fall in waiting time can show as positive.
// - Counting is opt-in (`count`) and only for quantities that grow (rule 7). The roll is the counter
//   block: it only counts up, never overshoots, and lands exactly on the value. The change line
//   appears when the number lands, because it describes the final value.
// - Every text box passes textSafe. Nothing in the block overlaps.
import { appear, go, px, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";
import { counterLayout, counterNodes, steadyLines, type CounterFormat, type CounterLayout } from "./counter";
import { fmt, twoLines, type Format } from "./util";
import { GESTURES, tagParts } from "./hand";

export type BigStatProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  value: number;
  format?: CounterFormat;
  /** What the number counts, with its unit when the number has none. */
  label: string;
  /** The change against an earlier value. `context` follows the word: "on 2025". */
  delta?: { value: number; format?: Format; context?: string; good?: "up" | "down" };
  /** Roll the number up as a counter, from `from` (default 0). Only for quantities that grow. */
  count?: boolean | { from?: number };
  align?: "left" | "center";
  /** A fixed role for the number. Default: the largest that fits. Stats set side by side should share
   *  one role: take the smallest `bigStatRole` of the group. */
  role?: TypeRole;
  at: number;
  until?: number;
};

type Plan = { num: CounterLayout; label: string[]; labelRole: TypeRole; delta?: { text: string; w: number }; h: number };

function deltaText(d: NonNullable<BigStatProps["delta"]>): string {
  const f = d.format ?? {};
  const v = Number((d.value).toFixed(f.decimals ?? 0));
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const word = v > 0 ? "up" : v < 0 ? "down" : "no change";
  const num = v === 0 ? "" : `${sign}${fmt(Math.abs(v), f)} `;
  return `${num}${word}${d.context ? ` ${d.context}` : ""}`;
}

/** Lays the stat out: the largest number role that leaves room for the label and the change. */
function plan(p: BigStatProps, ctx: Ctx): Plan {
  const labelRole: TypeRole = "caption";
  const lhC = ctx.lineHeight(labelRole), lhL = ctx.lineHeight("label");
  const gap = ctx.size("label") * 0.5;
  const oneLine = ctx.measure(p.label, labelRole) <= p.w;
  const two = twoLines(p.label);
  const label = oneLine || !two ? [p.label] : [...two];
  if (Math.max(...label.map((l) => ctx.measure(l, labelRole))) > p.w + 0.5) console.warn(`bigStat ${p.id ?? "stat"}: the label is wider than the box`);
  const dt = p.delta ? deltaText(p.delta) : undefined;
  const tri = ctx.size("label") * 0.62;
  const delta = dt ? { text: dt, w: tri + gap + ctx.measure(dt, "label") } : undefined;
  const rest = gap + lhC * label.length + (delta ? gap + lhL : 0);
  const from = typeof p.count === "object" ? (p.count.from ?? 0) : p.count ? 0 : p.value;
  const num = counterLayout({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h - rest, value: p.value, from, format: p.format, role: p.role }, ctx);
  return { num, label, labelRole, delta, h: num.h + rest };
}

const ORDER: TypeRole[] = ["display", "headline", "body", "caption", "label"];
/** The role the stat's number takes in its box, so a group of stats can share the smallest one. */
export const bigStatRole = (p: BigStatProps, ctx: Ctx): TypeRole => plan(p, ctx).num.role;
/** The smaller of two roles. */
export const smallerRole = (a: TypeRole, b: TypeRole): TypeRole => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export const bigStat: Block<BigStatProps> = (p, ctx) => tagParts(drawBigStat(p, ctx), p.id ?? "stat", GESTURES.bigStat!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawBigStat: Block<BigStatProps> = (p, ctx) => {
  const id = p.id ?? "stat";
  const pl = plan(p, ctx);
  const out: Node[] = [];
  const gap = ctx.size("label") * 0.5;
  const lhC = ctx.lineHeight(pl.labelRole), lhL = ctx.lineHeight("label");
  const center = p.align === "center";
  const xFor = (w: number) => (center ? p.x + (p.w - w) / 2 : p.x);
  // The group starts at the top of the box, so stats set side by side share one number line.
  let y = p.y;
  if (pl.h > p.h + 0.5) console.warn(`bigStat ${id}: the stat needs ${Math.ceil(pl.h)} px but its box is ${Math.floor(p.h)} px high`);
  const counting = p.count !== undefined && p.count !== false;
  const from = typeof p.count === "object" ? (p.count.from ?? 0) : counting ? 0 : p.value;

  // The number: a counter when it rolls, the same digits standing still when it does not.
  const rollAt = p.at + Math.max(0.5, ctx.dur.enter);
  const rollDur = ctx.dur.move * 3;
  out.push(...counterNodes({ id: `${id}-num`, x: xFor(pl.num.w), y, w: pl.num.w, h: pl.num.h, value: p.value, from, format: p.format, role: pl.num.role, at: p.at, until: p.until },
    ctx, { rollAt, rollDur }, pl.num));
  const lineTop = y + pl.num.padTop;
  if (!(ctx.system.bleed?.includes(pl.num.role)) && !textSafe(ctx, { x: xFor(pl.num.w), y: lineTop, w: pl.num.w, h: pl.num.lh })) console.warn(`bigStat ${id}: the number is outside the text-safe area`);
  y += pl.num.h + gap;

  // The label, one or two lines.
  const labelAt = p.at + ctx.dur.stagger * 2;
  pl.label.forEach((line, i) => {
    const w = ctx.measure(line, pl.labelRole);
    if (!textSafe(ctx, { x: xFor(w), y: y + i * lhC, w, h: lhC })) console.warn(`bigStat ${id}: label line ${i} is outside the text-safe area`);
    out.push(...steadyLines(ctx, { id: `${id}-label-${i}`, x: xFor(w), y: y + i * lhC, lines: [line], role: pl.labelRole, color: "inkMuted", at: labelAt + i * ctx.dur.stagger, until: p.until }));
  });
  y += lhC * pl.label.length;

  // The change: a triangle that points the way, then the signed value and the word.
  if (p.delta && pl.delta) {
    y += gap;
    const d = p.delta;
    const dir = d.value > 0 ? 1 : d.value < 0 ? -1 : 0;
    const good = (d.good ?? "up") === "up" ? dir > 0 : dir < 0;
    const role: ColorRole = dir === 0 ? "inkMuted" : good ? "positive" : "negative";
    const at = counting && from < p.value ? rollAt + (ctx.instant ? 0 : rollDur) : p.at + ctx.dur.stagger * 4;
    const x0 = xFor(pl.delta.w);
    const s = ctx.size("label") * 0.62;
    const cy = y + lhL / 2, cx = x0 + s / 2;
    const dPath = dir === 0
      ? `M${px(x0)} ${px(cy - s * 0.09)}H${px(x0 + s)}V${px(cy + s * 0.09)}H${px(x0)}Z`
      : dir > 0
        ? `M${px(cx)} ${px(cy - s * 0.5)}L${px(x0 + s)} ${px(cy + s * 0.4)}L${px(x0)} ${px(cy + s * 0.4)}Z`
        : `M${px(cx)} ${px(cy + s * 0.5)}L${px(x0 + s)} ${px(cy - s * 0.4)}L${px(x0)} ${px(cy - s * 0.4)}Z`;
    out.push({ id: `${id}-tri`, kind: "path", d: dPath, fill: role, box: { x: x0, y: cy - s / 2, w: s, h: s }, origin: [0.5, 0.5],
      tracks: { ...appear(ctx, at, p.until, 0), scale: go(ctx, at, 0.6, 1, "enter") } });
    const tx = x0 + s + gap, tw = ctx.measure(pl.delta.text, "label");
    if (!textSafe(ctx, { x: tx, y, w: tw, h: lhL })) console.warn(`bigStat ${id}: the change line is outside the text-safe area`);
    out.push(...steadyLines(ctx, { id: `${id}-delta`, x: tx, y, lines: [pl.delta.text], role: "label", color: "ink", at: at + ctx.dur.stagger, until: p.until }));
  }
  return out;
};
