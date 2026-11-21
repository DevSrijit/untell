// Ranking: a ranked list (rank, label, value bar, value) that re-orders from one state to a second.
//
// Rules this block enforces:
// - A title is required. It names the measure and the unit. The two states have names, shown under
//   the title; the name rolls over when the rows move.
// - Rank numbers belong to the slots and never move. Rows move between slots with `y` tracks.
// - No overlap during the move. The rows that keep their order relative to each other (the longest
//   such set that holds the key row) travel together on one start, one length and one curve that
//   never overshoots. Rows on that curve keep at least one row height apart, so they never touch.
//   Every other row fades out before the move, travels while hidden, and fades in at its new slot
//   after the move ends. In one-frame systems all rows jump in one frame.
// - Bars start at zero on one scale shared by both states, so a bar never shrinks while its value
//   grows. A bar too small to see gets a minimum length; its value is printed anyway.
// - Bars grow and change on ctx.noOvershoot("move"). Values swap by rolling: up when they grow,
//   down when they fall.
// - The key row is marked three ways: a drawn ink marker at its left edge, ink text (other rows are
//   muted) and the accent bar (other bars are muted ink). The marker is ink, not accent, so the row
//   holds one accent element, as Graphite asks.
// - Rows fit the box: label, bar and value on one line when the bar keeps at least 30 % of the width;
//   otherwise the bar goes on a second line under the label and the value, and a label too wide for
//   its column wraps, word by word, onto as many as three lines.
import { go, px, seq, textSafe, cut, windows } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Key, Node, TextNode } from "../types";
import { fmt, twoLines, type Format } from "./util";
import { GESTURES, hand, tagParts, textSafeBox } from "./hand";

export type RankingProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  title: string;
  /** The names of the two states, for example ["After 1 year", "After 30 years"]. */
  states: [string, string];
  rows: { label: string; before: number; after: number }[];
  /** The index (in `rows`) of the row that matters. */
  key?: number;
  format?: Format;
  at: number;
  /** When the rows move to the second state. Default: 1.6 s after the list has built. */
  moveAt?: number;
  until?: number;
};

/** Breaks a label into lines no wider than `w`, word by word (at most three lines). */
function wrap(text: string, w: number, measure: (t: string) => number): string[] {
  if (measure(text) <= w) return [text];
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > w) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  if (out.length > 3) return [out.slice(0, 2).join(" "), out.slice(2).join(" ")];
  return out;
}

/** Slots by value, largest first; ties keep the input order. */
const slotsOf = (vals: number[]) => {
  const order = vals.map((_v, i) => i).sort((a, b) => vals[b]! - vals[a]! || a - b);
  const slot: number[] = [];
  order.forEach((r, s) => (slot[r] = s));
  return slot;
};

/**
 * The rows that can travel in view: the largest set whose order is the same before and after,
 * holding row `must` when given. Rows in such a set never cross each other.
 */
function travellers(before: number[], after: number[], must?: number): Set<number> {
  const n = before.length;
  const byAfter = before.map((_, r) => r).sort((a, b) => after[a]! - after[b]!);
  // Longest increasing run of before-slots, in after order, through `must`.
  const best: number[] = new Array(n).fill(1), prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) {
    if (before[byAfter[j]!]! < before[byAfter[i]!]! && best[j]! + 1 > best[i]!) { best[i] = best[j]! + 1; prev[i] = j; }
  }
  // Backward lengths, so a chain through `must` can be counted on both sides.
  const tail: number[] = new Array(n).fill(1), next: number[] = new Array(n).fill(-1);
  for (let i = n - 1; i >= 0; i--) for (let j = i + 1; j < n; j++) {
    if (before[byAfter[j]!]! > before[byAfter[i]!]! && tail[j]! + 1 > tail[i]!) { tail[i] = tail[j]! + 1; next[i] = j; }
  }
  let mid = 0;
  if (must !== undefined) mid = byAfter.indexOf(must);
  else for (let i = 0; i < n; i++) if (best[i]! + tail[i]! > best[mid]! + tail[mid]!) mid = i;
  const out = new Set<number>();
  for (let i = mid; i >= 0; i = prev[i]!) out.add(byAfter[i]!);
  for (let i = next[mid]!; i >= 0; i = next[i]!) out.add(byAfter[i]!);
  return out;
}

export const ranking: Block<RankingProps> = (p, ctx) => tagParts(drawRanking(textSafeBox(ctx, p, `ranking ${p.id ?? "rank"}`, `use barChart (from: "top") for the final state`), ctx), p.id ?? "rank", GESTURES.ranking!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawRanking: Block<RankingProps> = (p, ctx) => {
  const id = p.id ?? "rank";
  const out: Node[] = [];
  const f = p.format ?? {};
  const n = p.rows.length;
  const lhL = ctx.lineHeight("label"), sL = ctx.size("label");
  const gap = sL * 0.6;
  const keyRow = p.key;
  const exit = p.until;
  const exitEnd = exit !== undefined ? exit + (ctx.instant ? 0 : ctx.dur.exit) : undefined;

  // Header: the title (one or two lines), then the state name.
  const titleL = ctx.measure(p.title, "label") <= p.w ? [p.title] : (twoLines(p.title) ?? [p.title]);
  const headH = lhL * titleL.length + lhL + gap * 1.5;

  // Columns.
  const markW = Math.max(ctx.stroke * 2, sL * 0.18);
  const rankW = Math.max(...p.rows.map((_, i) => ctx.measure(String(i + 1), "label")));
  const labW = Math.max(...p.rows.map((r) => ctx.measure(r.label, "label")));
  const vals = p.rows.flatMap((r) => [r.before, r.after]);
  const valW = Math.max(...vals.map((v) => ctx.measure(fmt(v, f), "label")));
  const xRank = p.x + markW + gap;
  const xLab = xRank + rankW + gap;
  const xValR = p.x + p.w;
  const barH = Math.max(ctx.stroke * 3, sL * 0.42);
  const oneLineBar = p.w - (xLab - p.x) - labW - gap * 2 - valW;
  const oneLine = oneLineBar >= p.w * 0.3;
  const bx0 = oneLine ? xLab + labW + gap : xLab;
  const bW = oneLine ? oneLineBar : xValR - xLab;
  // In the two-line layout a label too wide for its column (left of the values) wraps to two lines.
  const labCol = oneLine ? labW : xValR - valW - gap - xLab;
  const labLines = p.rows.map((r) => wrap(r.label, labCol, (t) => ctx.measure(t, "label")));
  const nl = Math.max(...labLines.map((l) => l.length));
  if (Math.max(...labLines.flat().map((l) => ctx.measure(l, "label"))) > labCol + 0.5) console.warn(`ranking ${id}: a label is too wide for its column`);
  const content = oneLine ? Math.max(lhL, barH) : lhL * nl + gap * 0.5 + barH;
  const rowH = Math.min(content + gap * 2.6, (p.h - headH) / n);
  if (rowH < content + gap * 0.5) console.warn(`ranking ${id}: the rows do not fit the box`);
  const rowsTop = p.y + headH;
  const maxV = Math.max(...vals, 1e-9);
  const barLen = (v: number) => (v <= 0 ? 0 : Math.max((v / maxV) * bW, barH * 0.5));

  // Timing.
  const t0 = p.at;
  const rowAt = (s: number) => t0 + ctx.dur.enter * 0.5 + s * ctx.dur.stagger * 2;
  const grow = ctx.instant ? 1 / 30 : ctx.dur.move * 1.4;
  const built = rowAt(n - 1) + grow;
  const moveAt = p.moveAt ?? built + 1.6;
  if (moveAt < built - 1e-6) throw new Error(`ranking ${id}: moveAt (${moveAt} s) comes before the list has built (${built.toFixed(2)} s). Give a moveAt of ${built.toFixed(2)} s or later, or leave it out (default: 1.6 s after the list has built).`);
  const moveDur = ctx.instant ? 1 / 30 : ctx.dur.move * 2;
  const moveEnd = moveAt + moveDur;
  if (p.until !== undefined && p.until < moveEnd + ctx.dur.enter) throw new Error(`ranking ${id}: until (${p.until} s) is not after the move to the second state and its settle (${(moveEnd + ctx.dur.enter).toFixed(2)} s). Give a later until, or an earlier moveAt.`);
  const curve = ctx.noOvershoot("move");

  const before = slotsOf(p.rows.map((r) => r.before));
  const after = slotsOf(p.rows.map((r) => r.after));
  const travel = ctx.instant ? new Set(p.rows.map((_, i) => i)) : travellers(before, after, keyRow);

  // Header text. Every text node gets its own masked reveal and a plain opacity track.
  const text = (nid: string, x: number, y: number, t: string, color: ColorRole, tracks: TextNode["tracks"]): TextNode => {
    const w = ctx.measure(t, "label");
    if (!textSafe(ctx, { x, y, w, h: lhL })) console.warn(`ranking ${id}: "${t}" is outside the text-safe area`);
    return { id: nid, kind: "text", x, y, text: t, role: "label", color, mask: true, tracks };
  };
  const shown = (at: number, until?: number): Key[] => {
    return windows([[at, until]]);
  };
  // Text rises on a curve that does not overshoot, so a wrapped label line never rises into the line above.
  const rise = (at: number) => (ctx.instant ? [{ t: Math.min(0, at), v: 0 }] : go(ctx, at, 100, 0, ctx.noOvershoot("enter"), 1, "enter"));
  const sink = (at: number | undefined) => (at === undefined ? [] : go(ctx, at, 0, -100, "exit"));
  titleL.forEach((l, i) => out.push(text(`${id}-title-${i}`, p.x, p.y + i * lhL, l, "inkMuted", { reveal: seq(rise(t0 + i * ctx.dur.stagger), sink(exit)), opacity: shown(t0, exitEnd) })));
  const sy = p.y + lhL * titleL.length + gap * 0.5;
  // The state name rolls over at the move: the first leaves upward, then the second rises in.
  const swapEnd = moveAt + (ctx.instant ? 0 : ctx.dur.exit);
  out.push(text(`${id}-state-0`, p.x, sy, p.states[0], "ink", { reveal: seq(rise(t0 + ctx.dur.stagger), sink(moveAt)), opacity: shown(t0, swapEnd) }));
  out.push(text(`${id}-state-1`, p.x, sy, p.states[1], "ink", { reveal: seq(ctx.instant ? [] : [{ t: Math.min(0, swapEnd), v: 100 }], rise(swapEnd), sink(exit)), opacity: shown(swapEnd, exitEnd) }));

  // Ranks: fixed in their slots.
  const lineY = (s: number) => rowsTop + s * rowH + (oneLine ? (content - lhL) / 2 : 0);
  for (let s = 0; s < n; s++) {
    const t = String(s + 1), w = ctx.measure(t, "label");
    out.push(text(`${id}-rank-${s}`, xRank + rankW - w, lineY(s), t, "inkMuted", { reveal: seq(rise(rowAt(s)), sink(exit)), opacity: shown(rowAt(s), exitEnd) }));
  }

  // Rows.
  p.rows.forEach((r, i) => {
    const s0 = before[i]!, s1 = after[i]!;
    const isKey = i === keyRow;
    const at = rowAt(s0);
    const dy = (s1 - s0) * rowH;
    const moves = s0 !== s1;
    const inView = travel.has(i);
    // y: a traveller glides; a hidden row jumps while it is out of view.
    const y: Key[] = !moves ? [{ t: 0, v: 0 }] : inView ? go(ctx, moveAt, 0, dy, curve, 2, "move")
      : cut(moveAt + moveDur / 2, 0, dy);
    // Opacity for the whole row: a hidden row fades out before the move and back in after it.
    const rowOp = (start: number): Key[] => {
      // On from frameOf(start); a row that starts before the film is on from the start of its keys, so they stay in order.
      const k: Key[] = start <= 0 ? [{ t: Math.min(start, moveAt - ctx.dur.exit), v: 1 }] : [{ t: 0, v: 0 }, ...cut(start, 0, 1)];
      if (!inView && !ctx.instant) k.push(...go(ctx, moveAt - ctx.dur.exit, 1, 0, "exit"), ...go(ctx, moveEnd, 0, 1, "enter"));
      if (exitEnd !== undefined) k.push(...cut(exitEnd, 1, 0));
      return k;
    };
    const ly = lineY(s0);
    const col: ColorRole = isKey ? "ink" : "inkMuted";
    labLines[i]!.forEach((l, k) => out.push(text(`${id}-r${i}-label-${k}`, xLab, ly + k * lhL, l, col,
      { reveal: seq(rise(at + k * ctx.dur.stagger), sink(exit)), opacity: rowOp(at), y })));

    // Values: right-aligned. A changed value rolls over at the move (in view) or swaps while hidden.
    const vb = fmt(r.before, f), va = fmt(r.after, f);
    const wb = ctx.measure(vb, "label"), wa = ctx.measure(va, "label");
    if (vb === va) {
      out.push(text(`${id}-r${i}-v`, xValR - wb, ly, vb, col, { reveal: seq(rise(at + ctx.dur.stagger), sink(exit)), opacity: rowOp(at), y }));
    } else {
      const up = r.after > r.before ? -100 : 100; // where the old value goes
      // The old value leaves once it has risen in: a move that comes sooner waits for the rise to end.
      const outAt = Math.max(inView ? moveAt : moveAt - ctx.dur.exit, at + ctx.dur.stagger + (ctx.instant ? 0 : ctx.dur.enter));
      const offOld = inView ? moveAt + (ctx.instant ? 0 : ctx.dur.exit) : moveAt;
      out.push(text(`${id}-r${i}-v0`, xValR - wb, ly, vb, col, {
        reveal: seq(rise(at + ctx.dur.stagger), inView ? go(ctx, outAt, 0, up, "exit") : []),
        opacity: inView ? shown(at, offOld) : [...(at <= 0 ? [{ t: Math.min(at, moveAt - ctx.dur.exit), v: 1 }] : shown(at)), ...go(ctx, moveAt - ctx.dur.exit, 1, 0, "exit")], y }));
      const inAt = inView ? offOld : moveEnd; // the new value enters once the old one has left
      const newRev: Key[] = inView ? seq([{ t: Math.min(0, inAt), v: -up }], ctx.instant ? cut(inAt, -up, 0) : go(ctx, inAt, -up, 0, "enter"), sink(exit)) : seq([{ t: 0, v: 0 }], sink(exit));
      const newOp: Key[] = inView ? shown(inAt, exitEnd) : [{ t: Math.min(0, moveEnd), v: 0 }, ...go(ctx, moveEnd, 0, 1, "enter"), ...(exitEnd !== undefined ? cut(exitEnd, 1, 0) : [])];
      out.push(text(`${id}-r${i}-v1`, xValR - wa, ly, va, col, { reveal: newRev, opacity: newOp, y }));
    }

    // The bar: one path as long as the longer state; `draw` sets how much of it shows.
    const lb = barLen(r.before), la = barLen(r.after), lm = Math.max(lb, la);
    const byc = oneLine ? rowsTop + s0 * rowH + content / 2 : rowsTop + s0 * rowH + lhL * nl + gap * 0.5 + barH / 2;
    if (lm > 0) {
      const fb = lb / lm, fa = la / lm;
      const change = fb === fa ? [] : inView ? go(ctx, moveAt, fb, fa, curve, 2, "move") : cut(moveAt + moveDur / 2, fb, fa);
      const draw: Key[] = seq(ctx.instant ? go(ctx, at, 0, fb) : [{ t: at, v: 0 }, { t: at + grow, v: fb, curve }], change);
      // The bar in the system's hand (hand.ts): round caps, square, or a row of cells (Console).
      const HB = hand(ctx);
      out.push({ id: `${id}-r${i}-bar`, kind: "path", d: `M${px(bx0)} ${px(byc)}H${px(bx0 + lm)}`, stroke: isKey ? "accent" : HB.context === "quiet" ? "inkMuted" : HB.context, width: barH,
        cap: HB.end === "full" ? "round" : "butt", dash: HB.bar === "cells" ? [barH, barH * 0.25] : undefined, blend: HB.bar === "overprint" ? "multiply" : undefined, z: isKey ? 2 : 1,
        tracks: { draw, opacity: rowOp(at), y } });
    }
    // The key marker: a short upright bar at the row's left edge.
    if (isKey) {
      const top = rowsTop + s0 * rowH, h = content;
      out.push({ id: `${id}-r${i}-mark`, kind: "rect", x: px(p.x), y: px(top), w: markW, h, fill: "ink", z: 2,
        tracks: { opacity: rowOp(at), y, scaleY: go(ctx, at, 0, 1, ctx.noOvershoot("enter")) }, origin: [0.5, 1] });
    }
  });
  return out;
};
